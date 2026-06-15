-- 022: processed_stripe_events に event_created_at を追加し、Stripe webhook の
--      last-write-wins / TOCTOU (#82 / P2-4, epic #77) を防ぐ。
-- ----------------------------------------------------------------------------
-- 背景:
--   013 で processed_stripe_events を追加した際のコメントに
--     "Optional last_event_at column lets us reject out-of-order events per
--      customer."
--   とあるが、その列も recency gate も実装されていなかった。並列イベント
--   (例: invoice.payment_succeeded と customer.subscription.deleted が同時到着)
--   や遅延リトライで、古い event が新しい state を上書きし、profiles.plan /
--   subscription_status が Stripe の真の最新と乖離する。
--
-- 設計:
--   - processed_stripe_events に event_created_at (= Stripe event.created を
--     timestamptz 化した値) を追加。webhook は claim INSERT 時にこの値を書く。
--   - 副作用適用前に、同一 customer_id で既に status='processed' になっている
--     行の最大 event_created_at と比較し、incoming event の方が古ければ
--     副作用を skip (= 200 ack)。これにより per-customer の高水位ガードを
--     index (idx_processed_stripe_events_customer) 経由で安価に実現する。
--   - 既存行は event_created_at = processed_at で backfill (近似)。これらは
--     既に副作用適用済なので high-water mark として機能すれば十分。
--   - NULL 許容: event.created を持たない将来の event 形でも INSERT が壊れない
--     ように nullable のままにする (gate は NULL を「比較不能 = 適用」に倒す)。
-- ----------------------------------------------------------------------------

alter table public.processed_stripe_events
  add column if not exists event_created_at timestamptz;

-- 既存行は処理済なので processed_at を high-water mark の近似として backfill。
update public.processed_stripe_events
  set event_created_at = processed_at
  where event_created_at is null;

-- per-customer recency lookup を支える partial index。
-- (customer_id, event_created_at desc) で「この customer の最新適用済 event」を
-- 1 行で引けるようにする。customer_id NULL 行 (one-off invoice 等) は対象外。
create index if not exists idx_processed_stripe_events_customer_recency
  on public.processed_stripe_events (customer_id, event_created_at desc)
  where customer_id is not null and status = 'processed';
