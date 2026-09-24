-- One-time cleanup. Before the bet route was restricted to live-match
-- markets, Futures/Props/Tournament Winner accepted MM Coin bets on mock
-- odds that nothing could ever settle. This refunds every such pending
-- stake and removes those bets. Live-match bets are untouched.
--
-- Run step 1 first and check the numbers; then run step 2.

-- Step 1: preview (read-only).
select market_key, count(*) as bets, sum(stake) as total_stake
from mm_coin_bets
where status = 'pending' and market_key not like 'live-match:%'
group by market_key
order by market_key;

select b.profile_id, p.display_name, sum(b.stake) as refund
from mm_coin_bets b
left join profiles p on p.id = b.profile_id
where b.status = 'pending' and b.market_key not like 'live-match:%'
group by b.profile_id, p.display_name
order by refund desc;

-- Step 2: refund and remove, in one transaction.
begin;

update wagers_accounts a
  set mm_coins_balance = a.mm_coins_balance + r.refund
  from (
    select profile_id, sum(stake) as refund
    from mm_coin_bets
    where status = 'pending' and market_key not like 'live-match:%'
    group by profile_id
  ) r
  where r.profile_id = a.profile_id;

delete from mm_coin_bets
  where status = 'pending' and market_key not like 'live-match:%';

commit;
