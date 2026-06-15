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
--     timestamptz 化した値) を nullable で追加。
--   - webhook は **実際に billing mutation を適用した event のみ** success path
--     でこの値を書く (claim INSERT 時には書かない)。これにより:
--       * no-op パス (payment_failed attempt<2 / one-off invoice / unmapped /
--         unhandled type) が high-water mark にならず、遅延到着した古い実更新を
--         握りつぶさない (Codex review)。
--       * claim INSERT がこの列を参照しないため、本マイグレーション適用前に
--         アプリがデプロイされても claim が unknown-column で 500 しない
--         (deploy-ordering, Codex review)。
--   - 副作用適用前に、同一 customer_id で既に status='processed' かつ
--     event_created_at が non-null な行の最大値と比較し、incoming event の方が
--     古ければ副作用を skip (= 200 ack)。per-customer の高水位ガードを下記
--     partial index 経由で安価に実現する。
--   - 既存行は backfill しない (NULL のまま)。processed_at は「受信時刻」であり
--     Stripe の真の event.created より後になり得るため、これを high-water mark に
--     使うと、後から到着した「実際にはより新しい」event が人工的に膨らんだ値と
--     比較されて恒久的に skip される (Codex review)。NULL 行は recency 比較から
--     除外されるため、移行直後の active customer は次の mutating event で自然に
--     高水位を確立する (それまでは fail-open = 適用)。
-- ----------------------------------------------------------------------------

alter table public.processed_stripe_events
  add column if not exists event_created_at timestamptz;

-- per-customer recency lookup を支える partial index。
-- (customer_id, event_created_at desc) で「この customer の最新適用済 event」を
-- 1 行で引けるようにする。customer_id NULL 行 (one-off invoice 等) と、recency
-- marker 未記録の no-op / 履歴行 (event_created_at NULL) は対象外。
create index if not exists idx_processed_stripe_events_customer_recency
  on public.processed_stripe_events (customer_id, event_created_at desc)
  where customer_id is not null
    and status = 'processed'
    and event_created_at is not null;
