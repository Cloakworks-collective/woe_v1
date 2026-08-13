import Link from "next/link";
import { Art } from "@/components/Art";
import { Panel } from "@/components/Panel";
import {
  BLACK_MARKET,
  ERA_PEACE_DAYS,
  HOLD_CLOCKS,
  MARKET_FEE,
  MARKET_PRICE_MAX,
  MARKET_PRICE_MIN,
  ARMY_FLOORS,
  CHAT_LIMITS,
  CLAN_MUTE_DAYS,
  GOLD_PER_CIVILIAN_AT_FULL_TAX,
  REVENGE_WINDOW_HOURS,
  SIEGE_SALVAGE_VALUE,
  STEWARD_QUEUE_CAP,
  TURNS_PER_DAY,
  workerOutputAtLevel,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

// A section of the field manual: anchored so pages can deep-link to it.
function Guide({
  id,
  title,
  illo,
  children,
}: {
  id: string;
  title: string;
  illo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel guide-sec" id={id}>
      <h3>{title}</h3>
      <div className="body">
        {illo && (
          <span className="guide-illo">
            <Art path={illo} size={84} />
          </span>
        )}
        {children}
      </div>
    </section>
  );
}

export default function GuidePage() {
  return (
    <>
      <Panel title="📜 The Field Manual — how War of Empires is won">
        <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>
          Everything you need to rule: what each part of the empire does, how to grow, how to fight,
          and how to win the era. Jump to a chapter, or read it through once — it&apos;s the whole
          game in a few minutes.
        </p>
        <div className="guide-toc">
          <Link href="#account">🔑 Your Account</Link>
          <Link href="#winning">🏆 Winning the Era</Link>
          <Link href="#grow">🌱 How to Grow</Link>
          <Link href="#army">⚔️ Building an Army</Link>
          <Link href="#battle">🔥 Battle Strategies</Link>
          <Link href="#shadows">🗡️ Spies &amp; Scouts</Link>
          <Link href="#clans">🛡️ Clans</Link>
          <Link href="#defense">🏰 Defending the Realm</Link>
          <Link href="#heralds">✉️ Letters, Halls &amp; the Forum</Link>
          <Link href="#charter">👑 The Royal Charter</Link>
          <Link href="#strategy">🎯 Strategy &amp; First Days</Link>
        </div>
        <p style={{ fontSize: 13.5, fontWeight: 700, margin: "12px 0 4px", color: "var(--heading)" }}>
          ⚔️ The Advanced Manual — mastering the endgame
        </p>
        <div className="guide-toc">
          <Link href="#regulars">💀 Saving &amp; Killing Regulars</Link>
          <Link href="#clocks">👑 Ranking &amp; Starting the Clocks</Link>
          <Link href="#revenge">🗡️ Effective Revenge</Link>
          <Link href="#market-mastery">⚖️ Using the Market</Link>
          <Link href="#rich">💰 Getting Rich</Link>
        </div>
      </Panel>

      <Guide id="account" title="🔑 Your Account — one key, one empire an age" illo="buildings/hearthstead">
        <p>
          There is <b>no password and no email</b>. When you first raise a banner you are given a{" "}
          <b>magic link</b> — a single secret that is your account. Clicking it on any device signs
          that device in; pasting it into the box at the gate does the same. It never expires, and
          it is the only key you will ever need.
        </p>
        <p>
          Find it any time in the <Link href="/">Command View</Link>, under{" "}
          <b>🔑 Your magic link</b>. <b>Keep it secret — whoever holds it is you.</b> It cannot be
          reset or recovered, because nothing was ever collected that could prove the account is
          yours.
        </p>
        <h4>One key, three doors</h4>
        <ul>
          <li>
            <b>This empire</b>, in a browser.
          </li>
          <li>
            <b>The <Link href="/forum">forum</Link></b>, which outlives every age. The first time
            you post there you choose a <b>forum name</b> — that one you keep forever, unlike your
            empire&apos;s. Reading needs no account at all.
          </li>
          <li>
            <b>The terminal client</b>: <code>node cli/woe.mjs link &lt;key&gt;</code>.
          </li>
        </ul>
        <h4>One empire per age</h4>
        <p>
          An account may hold <b>exactly one empire in each age</b>. When an age is sealed every
          empire in it is gone — the ladder, the clans, the armies — and your account founds a{" "}
          <b>new</b> one in the age that follows, with a different name and a different race if you
          like. Your forum name, your posts and your history carry over; the empire does not.
        </p>
        <p className="guide-tip">
          💡 That rule is why alts cannot stuff a clan or feed a rank: the empire is bound to the
          account that founded it, and one account can only ever field one army.
        </p>
      </Guide>

      <Guide id="winning" title="🏆 Winning the Era — the goal of the game" illo="buildings/ironhold">
        <p>
          The game runs in <b>eras</b> (seasons). An era ends the moment someone wins, and{" "}
          <b>the next era is named after the winner</b> — that name is permanent. There are two
          paths to the crown, and both are a <b>race you can watch on the ladder</b>.
        </p>
        <h4>1 · Grand Overlord (solo)</h4>
        <ul>
          <li>
            Hold the <b>#1 ranking spot</b> for <b>{HOLD_CLOCKS.CUMULATIVE_HOURS} hours cumulative</b>{" "}
            (this clock never resets) <b>and</b> <b>{HOLD_CLOCKS.STREAK_HOURS} hours unbroken</b>{" "}
            (this streak resets every time you&apos;re knocked off #1).
          </li>
          <li>
            The clocks only tick while you field <b>{fmt(ARMY_FLOORS.INDIVIDUAL)}+ regular
            troops</b> (footmen, archers, cavalry — mercenaries and engineers never count),{" "}
            <b>and only if you have never joined a clan this age</b>. Gold cannot buy the solo
            crown, and neither can a clan&apos;s vault.
          </li>
          <li>
            Touching #1 isn&apos;t enough — you must <b>defend</b> it. Rivals will bombard, revenge,
            and scatter your people to break your streak.
          </li>
        </ul>
        <h4>2 · Clan Victory</h4>
        <p>
          The same two clocks, but for the <b>#1 clan</b> — its score is the sum of every member&apos;s
          score plus clan-building points. The clan must stay above{" "}
          <b>{fmt(ARMY_FLOORS.CLAN)}</b> regulars across its members. Losing a clan war freezes the clocks
          for 48 hours, so beating the leading clan is a direct play against their win.
        </p>
        <h4>What the ranking score measures — the visible empire</h4>
        <p>
          Your score is what a besieger outside your gate could see. <b>It counts:</b> civilian
          population, regular troops (by tier, and scaled by your race), <b>sellswords</b> at a
          discount, scouts at a discount, engineers, your <b>crewed defensive works</b>, wall level
          scaled by integrity, army experience, and the <b>{fmt(9)} ranked research fields</b> of{" "}
          {fmt(12)}.
        </p>
        <p>
          <b>It counts for nothing:</b> your offensive siege train, spies, gold and resources,
          civilian buildings and housing, and the three unranked research fields (Tradecraft,
          Pathfinding, Free Companies). Wealth buys no prestige and{" "}
          <b>power in the shadows brings none either</b> — the ladder tells a rival{" "}
          <i>whether</i> you are worth their turns, and only a scout tells them <i>how</i> to attack
          you. That is why your engines never appear. See the live race on your{" "}
          <Link href="/">Command View</Link>, the full <Link href="/rankings">ladder</Link>, or take
          it apart yourself in the <Link href="/tools/ranking">Ranking Calculator</Link>.
        </p>
      </Guide>

      <Guide id="grow" title="🌱 How to Grow — economy, population, research" illo="workers/farmers">
        <p>
          One turn is <b>10 minutes</b>; a full day is <b>{TURNS_PER_DAY} turns</b>. Everything below
          runs every turn while you&apos;re offline.
        </p>
        <h4>Peasants → workers or soldiers</h4>
        <p>
          New settlers arrive every dawn — <b>10/day up to 100/day</b>, and the four things that
          decide it are all yours to change: a flat <b>+10 base</b>, up to <b>+10</b> for a garrison
          that makes people feel safe (+4 at 20% troops-to-civilians, +8 at 25%, +10 at 30%), up to{" "}
          <b>+40</b> for the four resource buildings (work to be had — storage does not count), and
          up to <b>+40</b> for walls (+4 a level, scaled by how intact they are). Arrivals that find
          no vacant bed walk on and are lost, so build Hearthsteads ahead of growth. The breakdown
          is on your <Link href="/">Command View</Link>. On the{" "}
          <Link href="/train">Workers &amp; Levy</Link> page you assign peasants
          as <b>workers</b> (who produce gold &amp; resources every turn) or train them into{" "}
          <b>military</b>, <b>spies</b>, or <b>scouts</b>.
        </p>
        <h4>The tax dial — your gold engine</h4>
        <ul>
          <li>
            Tax runs <b>0–100%</b>. Higher tax = more gold, but your producers make fewer resources
            (they&apos;re the same workers). Around{" "}
            <b>{fmt(GOLD_PER_CIVILIAN_AT_FULL_TAX * 0.5 * TURNS_PER_DAY)} gold per citizen per
            day</b> at the 50% default. Set it on the <Link href="/">Command View</Link>.
          </li>
          <li>
            <b>Coin is plentiful; goods are not.</b> A worker digs{" "}
            <b>{fmt(workerOutputAtLevel(1))}/turn at building level 1</b>, rising to{" "}
            <b>{fmt(workerOutputAtLevel(10))}</b> at level 10 — while your treasury fills far
            faster. So the binding question is rarely &ldquo;can I afford it&rdquo; and almost
            always <b>&ldquo;can I get the materials&rdquo;</b>. That makes the{" "}
            <Link href="/market">Bazaar</Link> and the{" "}
            <Link href="/blackmarket">Black Market</Link> the centre of the economy: gold is how you
            buy goods, and goods are what everything is built from. It also makes a{" "}
            <b>raid</b> on somebody&apos;s unstored stockpile worth far more than their purse.
          </li>
          <li>
            Bank gold in the Counting House and shelter goods in your storehouses — anything loose
            is lootable.
          </li>
        </ul>
        <h4>Food is life</h4>
        <p>
          Your people eat <b>0.1 food each per turn</b>. If food hits zero,{" "}
          <b>everything freezes</b> — production, research, taxes, growth, even attacking — until
          they&apos;re fed. Keep farmers ahead of your population, and buy food at the{" "}
          <Link href="/market">Bazaar</Link> in a pinch.
        </p>
        <h4>Buildings</h4>
        <p>
          On the <Link href="/buildings">Buildings</Link> page: production buildings raise output,
          storage buildings <b>shelter resources from raids</b> (20,000 × level protected), housing
          drives population growth, and knowledge/trade/military buildings unlock research, the
          market, and higher troop tiers. Builds are instant if you can afford them.
        </p>
        <h4>Research — the Collegium</h4>
        <p>
          <Link href="/research">The Collegium</Link> has <b>12 fields × 5 levels</b>. Any field is
          researchable at any time — the Collegium only sets the <b>speed</b> (its level lifts how
          much research each of your scholars banks per turn). But every level you earn, in{" "}
          <i>any</i> field, makes the <b>next one costlier</b> — a single global, escalating price —
          so the <b>order you research is the strategy</b>, and you can never master all ten.
          Assign researchers on the <Link href="/train">Workers</Link> page; switching fields
          forfeits <b>half</b> the progress banked toward the current one. Nine fields also raise
          your ranking score; the three that do not are <b>Tradecraft</b>, <b>Pathfinding</b> and{" "}
          <b>Free Companies</b> — it would be a strange ladder that advertised how deep your spy
          service runs. <b>Statecraft</b> multiplies your <i>tax income</i>, not your workshops.
        </p>
        <p className="guide-tip">
          💡 Early game: raise housing + production, keep food positive, pick <b>one</b> research
          lane, and stay under a shield or the era peace while you build a base.
        </p>
      </Guide>

      <Guide id="army" title="⚔️ Building an Army — troops, tiers, mercenaries" illo="units/footman">
        <p>
          Raise soldiers straight from idle peasants on <Link href="/troops">The Army</Link> — there
          is no warrior middle step. Pick one of the three combat classes at a light → medium → heavy
          tier (heavier = more power, more resources &amp; ore). Each tier needs its trainer{" "}
          <i>and</i> the Forge at that same level, plus a free Muster Hall bed:
        </p>
        <ul>
          <li>
            <b>Footmen</b> — melee infantry; the backbone of any wall assault.
          </li>
          <li>
            <b>Archers</b> — fire before melee; damage spreads across the whole enemy army.
          </li>
          <li>
            <b>Cavalry</b> — strike from the flanks, hit hardest, best in open-field raids.
          </li>
          <li>
            <b>Siege engineers</b> — operate rams &amp; trebuchets; fire first, grind walls. Built at
            the <Link href="/siege">Siege Works</Link>. (Invisible to the ladder.)
          </li>
        </ul>
        <h4>Mercenaries — rented muscle</h4>
        <p>
          Hire mercs on <Link href="/troops">The Army</Link> in the same arms and tiers as your own
          troops — a heavy-cavalry sellsword needs Knights&rsquo; Stables 3 + Forge 3, just like the
          real thing. They cost <b>only gold</b> (no peasants) and{" "}
          <b>die before your matching regulars</b> (a shield for your veterans), but cost{" "}
          <b>gold every turn</b> or they defect, and are capped at <b>25% of your regular army</b>.
          They never count toward your score or the population floors.
        </p>
        <h4>Experience &amp; stamina</h4>
        <ul>
          <li>
            Troops gain <b>experience</b> from battle (up to +100% power at max). But{" "}
            <b>losing regulars loses experience</b> — veterancy dies with the veterans. Merc deaths
            cost nothing.
          </li>
          <li>
            Fighting drains <b>stamina</b>; low stamina weakens attack &amp; defence. Rest costs turns
            + food, or it recovers passively at 1/turn.
          </li>
        </ul>
      </Guide>

      <Guide id="battle" title="🔥 Battle Strategies — attack modes, phases, warfare" illo="units/cavalry">
        <p>
          Every attack costs <b>10 action turns</b> (you earn 2 per game turn, start with 200). Find
          targets on the <Link href="/rankings">ladder</Link> — there&apos;s no map — and launch
          straight from each empire&apos;s row there — <b>⚔ Attack</b>, <b>🏹 Scout</b> and{" "}
          <b>🗡 Spy</b> each have their own button, and the sidebar&apos;s <b>Take Action</b> group
          opens the same ladder at your own rank with just that one order showing.
        </p>
        <h4>The four attack modes</h4>
        <ul>
          <li>
            <b>Raid</b> — steal anything <i>outside</i> storage (never gold). Field army vs field
            army: no walls, no siege phase. The bread-and-butter income raid.
          </li>
          <li>
            <b>Siege (&ldquo;castle attack&rdquo;)</b> — the main offensive: siege engines batter the
            walls, then you take <b>gold + unstored goods</b>.
          </li>
          <li>
            <b>Revenge</b> — to <b>kill troops</b>. Opens for 18h after you&apos;re attacked; ignores
            vacation, low stamina, and broken walls, gives the defender <b>no chance to yield</b>,
            and <b>chains</b> (revenge re-arms the victim&apos;s window).
          </li>
          <li>
            <b>Bombard</b> — an artillery duel that wrecks <b>walls first</b>, then cracks random
            town buildings once breached. No troops, no loot — it&apos;s pure sabotage of a rival&apos;s
            score.
          </li>
        </ul>
        <h4>How a battle resolves (per round)</h4>
        <p>
          Four phases in order: <b>1. siege weapons</b> (grind walls; each crewed defensive counter
          the defender fields <b>cancels one incoming enemy engine</b> of its paired weapon) →{" "}
          <b>2. archers</b> → <b>3. cavalry charge</b> → <b>4. footmen</b>. A side breaks when it
          drops <b>below 30% strength</b>. Every battle has ±10% luck. Raids skip the siege phase
          and give no wall bonus.
        </p>
        <h4>Killing population — the real weapon</h4>
        <p>
          Killing <b>regular troops kills actual population</b> — the worst blow you can land (and
          hard, since mercs die first). And <b>scattering</b>: if a defender&apos;s troops fall below{" "}
          <b>30% of their civilians</b> at the daily reset, unprotected peasants flee down to that
          line. Bombard + revenge to scatter a leader&apos;s people is the classic{" "}
          <b>anti-Overlord</b> play — it cuts their score and can freeze their victory clock.
        </p>
        <h4>Experience rewards (attacker)</h4>
        <ul>
          <li>Within ±20% of your strength: <b>+5</b> (a fair fight).</li>
          <li>20–75% stronger than you: <b>+8</b> (bold).</li>
          <li>20–50% weaker: <b>+1</b>; more than 50% weaker: <b>−5</b> (bullying).</li>
          <li>75%+ stronger: your troops <b>refuse</b> and call you an idiot. Defenders always +5.</li>
        </ul>
        <p className="guide-tip">
          💡 Combo play: raid to drain stamina → bombard to breach walls → siege for the gold. And
          keep your own troops above 30% of civilians, always.
        </p>
      </Guide>

      <Guide id="shadows" title="🗡️ Spies & Scouts — the shadow war" illo="units/spy">
        <p>
          <b>Spies</b> run five Tradecraft operations — intel, sabotage, arson, sowing unrest —
          from any empire&apos;s row on the <Link href="/rankings">ladder</Link>, or from the full
          War Council on their profile.
          Send more spies for more damage,
          but higher catch risk; <b>caught spies are executed</b> (you lose the population).{" "}
          <b>Scouts</b> gather recon on rivals and, at home, catch enemy spies — your Ranger&apos;s
          Lodge level sets how skilled a spy they can catch. Spies, scouts, and their research are{" "}
          <b>invisible to the ladder</b>, so this is power without prestige.
        </p>
      </Guide>

      <Guide id="clans" title="🛡️ Clans — strength in numbers" illo="clan/crest">
        <p>
          On the <Link href="/clan">Clan</Link> page you can <b>found a clan for 50,000 gold</b>{" "}
          (you lead it alone) or petition to join one. A clan holds <b>up to 5 members</b> at first,
          rising to <b>20</b> as the Hall is raised. Members feed a shared pool that leadership
          spends on clan buildings: <b>Clan Storage</b> → <b>Clan Hall</b> (raises the member cap
          and shrinks the tax penalty members feel, down to 50%) → <b>Clan Wonder</b> (discounts
          troop, merc &amp; siege costs for every member).
        </p>
        <p>
          Once you fly a banner the Clan page opens into four tabs:{" "}
          <Link href="/clan">Hall</Link> (crest, roster, and the gate where petitions wait),{" "}
          <Link href="/clan/works">Works &amp; Vault</Link> (raise and repair the three works, and
          give to or draw from the shared pool that pays for them),{" "}
          <Link href="/clan/chat">Chat</Link>, and{" "}
          <Link href="/clan/war">War Front</Link> (declare war, and bombard an enemy&apos;s works).
          The tabs carry counts — waiting petitions and the day&apos;s chat — so you can see what
          needs you without opening each one.
        </p>
        <p>
          <b>Clan wars double battle damage both ways.</b> Winning a war siphons tribute and freezes
          the loser&apos;s victory clocks for 48h. Neutral is the default; friendly clans share online
          status and last-attacked times.
        </p>
      </Guide>

      <Guide id="defense" title="🏰 Defending the Realm — don't be easy prey" illo="buildings/walls">
        <ul>
          <li>
            <b>Raise your walls</b> (<Link href="/buildings">Buildings</Link>). Wall level² feeds
            your score and blunts sieges — but damaged walls also cut daily recruitment up to 50%,
            so <b>repair them</b>.
          </li>
          <li>
            <b>Buy &amp; crew defensive counters</b> at the <Link href="/siege">Siege Works</Link> —
            bought and manned by engineers just like your offensive gear; on defence each crewed
            counter <b>cancels one incoming enemy engine</b> of its paired weapon.
          </li>
          <li>
            <b>Store your resources &amp; bank your gold</b> — only what&apos;s sheltered survives a
            raid or siege.
          </li>
          <li>
            <b>Keep troops above 30% of civilians</b> so your people never scatter at the reset.
          </li>
          <li>
            <b>Vacation</b> is an option (Command View): you can&apos;t attack and your tax halves,
            but you become immune to everything except revenge. Don&apos;t confuse it with{" "}
            <b>yielding</b> — a yield is decided for you on the battlefield when you&apos;re
            outmatched, and it saves your soldiers but not your stores.
          </li>
          <li>
            New empires get a <b>72-hour shield</b>, and the first <b>{ERA_PEACE_DAYS} days</b> of
            every era are total peace — use that time to build.
          </li>
        </ul>
      </Guide>

      <Guide id="strategy" title="🎯 Strategy & Your First Days — a veteran's counsel" illo="buildings/collegium">
        <h4>The first days</h4>
        <ul>
          <li>
            <b>Grow first, fight later.</b> Under your shield (and the era peace), raise housing and
            production so more settlers arrive each dawn — aim to lift your daily recruitment steadily.
          </li>
          <li>
            <b>Balance the three needs:</b> enough <b>farmers</b> to feed everyone, enough{" "}
            <b>miners</b> to arm your troops with ore, and enough <b>soldiers</b> that raiders
            can&apos;t just walk in. Too many of any one and something starves.
          </li>
          <li>
            <b>Pick a research lane</b> and commit — you can never master all ten fields, so become
            the economist, the warlord, or the spymaster.
          </li>
        </ul>
        <h4>Fighting smart</h4>
        <ul>
          <li>
            <b>Punch slightly down.</b> The surest wins come against empires <b>10–20% weaker</b>{" "}
            than you. Even fights are coin-flips; anyone <b>75%+ stronger, your troops refuse</b>.
          </li>
          <li>
            <b>Chase quality experience.</b> Fights within ±20% (or a bold target up to 75% stronger)
            season your army; <b>bullying much weaker empires costs you experience and loot</b>.
          </li>
          <li>
            <b>Soften, then strike.</b> Raid to drain a target&apos;s stamina, bombard to crack the
            walls, rest your own army to full — <i>then</i> launch the castle attack for the gold.
          </li>
          <li>
            <b>Field the heaviest troops you can</b> — one heavy fights like three lights but fills a
            single barracks bed, so heavy armies pack more punch into the same housing.
          </li>
        </ul>
        <h4>Mercenaries &amp; the shadows</h4>
        <ul>
          <li>
            <b>Hire mercenaries when gold allows</b> — they die before your regulars, shielding your
            hard-won veterans. Keep them a tier <i>below</i> your regulars so the cheap meat falls
            first, and remember: dead mercs can be re-bought, dead regulars cannot.
          </li>
          <li>
            <b>Spies wreck siege engines</b> — both theirs and yours are vulnerable, so guard your
            arsenal with scouts and a good Ranger&apos;s Lodge.
          </li>
        </ul>
        <h4>Allies &amp; enemies</h4>
        <ul>
          <li>
            <b>A clan is strength.</b> Join or found one to share storage, wage wars together, and
            climb toward a clan victory no soloist can reach.
          </li>
          <li>
            <b>Don&apos;t make needless enemies.</b> Hammering one rival relentlessly invites their
            clan to declare war on yours — pick your grudges, and keep your own banner-mates close.
          </li>
          <li>
            And above all — <b>it&apos;s a game</b>. Raid boldly, defend cleverly, and have fun.
          </li>
        </ul>
      </Guide>

      <Panel title="⚔️ The Advanced Manual — mastering the endgame">
        <p style={{ fontSize: 14.5, lineHeight: 1.6 }}>
          You know the rules; now the deep game. These chapters are how the crown is actually won —
          protecting your real population, striking where it hurts, and turning a bulk economy into
          a war chest.
        </p>
      </Panel>

      <Guide id="heralds" title="✉️ The Heralds — letters, halls & the forum" illo="buildings/collegium">
        <p>
          Three places to speak, and they do not outlive each other.
        </p>
        <ul>
          <li>
            <b><Link href="/messages">Letters</Link></b> — a private thread with one other ruler.
            Wiped when the age is sealed.
          </li>
          <li>
            <b><Link href="/messages/chat">Era Chat</Link></b> — one public room for everyone
            playing this age. Also wiped with it.
          </li>
          <li>
            <b><Link href="/clan/chat">The clan hall</Link></b> — your banner only. It keeps its
            last words and no more.
          </li>
          <li>
            <b><Link href="/forum">The Forum</Link></b> — the permanent one. It outlives every age,
            needs no empire to read, and is where anything worth keeping should go.
          </li>
        </ul>
        <h4>Limits, and why they exist</h4>
        <p>
          Any room can be shouted down by one person with a keyboard, so the halls hold you to{" "}
          <b>{CHAT_LIMITS.BURST.messages} messages every {CHAT_LIMITS.BURST.minutes} minutes</b>,{" "}
          <b>{CHAT_LIMITS.HOURLY.messages} an hour</b>, and{" "}
          <b>{CHAT_LIMITS.DAILY.messages} a day</b>. The windows slide rather than resetting on the
          hour, so the limit loosens as your oldest words age out. <b>Letters are exempt</b> — a
          private thread with one other player is not a room anyone can be shouted out of.
        </p>
        <p>
          A clan&apos;s leadership may also <b>silence</b> a member in the hall for{" "}
          <b>{CLAN_MUTE_DAYS.join(" or ")} days</b>. A silenced member still <b>reads</b>{" "}
          everything — someone who cannot see the hall cannot follow the war they are fighting in.
        </p>
      </Guide>

      <Guide id="charter" title="👑 The Royal Charter — the Steward" illo="buildings/counting_house">
        <p>
          The <Link href="/premium">Royal Charter</Link> is optional and lasts <b>one age</b>. It
          buys no troops, no resources and no combat advantage — it buys{" "}
          <b>not having to be at the keyboard</b>.
        </p>
        <p>
          It unlocks the <Link href="/steward">Steward</Link>: build and research{" "}
          <b>queues</b> of up to {STEWARD_QUEUE_CAP} entries each, <b>standing orders</b>, and{" "}
          <b>auto-banking</b> so your coin is sheltered while you sleep instead of sitting loose for
          the first raider who rides past.
        </p>
        <p className="guide-tip">
          💡 Everything the Steward does you can do by hand, on time, for free. What you are buying
          is the <i>on time</i>.
        </p>
      </Guide>

      <Guide id="regulars" title="💀 Saving & Killing Regulars — the population war" illo="units/footman">
        <p>
          <b>Regular troops are real population.</b> Every regular is a citizen who counts toward
          your score and the victory population floor, carries hard-won <b>experience</b>, and{" "}
          <b>cannot be re-bought</b> — kill one and it&apos;s gone for good, experience and all.
          Mercenaries are the opposite: pure gold, invisible to the ladder, endlessly replaceable.
          The whole endgame turns on this asymmetry.
        </p>
        <h4>Saving your own regulars</h4>
        <ul>
          <li>
            <b>Put a merc shield in front.</b> Hire mercenaries in the same arm and a tier{" "}
            <i>below</i> your regulars — they <b>die first</b>, soaking the losses. Dead mercs you
            re-buy with gold; dead regulars take your veterancy to the grave.
          </li>
          <li>
            <b>Fight rested, and don&apos;t bleed even wins.</b> Every round still kills some of the
            winning side — pick fights you win <i>decisively</i> (punch 10–20% down), rest to full
            stamina first, and never grind an even fight that trades your veterans away.
          </li>
          <li>
            <b>Discharge only with a bed free.</b> Sending a soldier home needs an empty Hearthstead
            bed and holds the 30% guard line — the Army page shows how many are safe to discharge.
          </li>
        </ul>
        <h4>Killing the enemy&apos;s regulars</h4>
        <ul>
          <li>
            <b>Punch through the merc shield.</b> Their mercenaries die before their regulars, so
            you must bring <i>enough</i> force — heavy troops, full stamina — to grind past the
            hirelings and into the real population.
          </li>
          <li>
            <b>Use Revenge</b> (next chapter) — the one mode built to kill troops rather than loot.
          </li>
          <li>
            <b>The reward is permanent.</b> Each regular you kill is population they can never
            re-buy: their score drops, their army loses experience, and if you push them below{" "}
            <b>30% troops-to-civilians</b>, the rest of their peasants <b>scatter</b> at the next
            dawn — a score collapse that can freeze a victory clock.
          </li>
        </ul>
      </Guide>

      <Guide id="clocks" title="👑 Ranking & Starting the Clocks — how the crown is held" illo="buildings/ironhold">
        <p>
          Winning is a <b>race on the ladder</b>, and the finish line is two clocks. But the clocks
          don&apos;t even start until you&apos;ve built a big enough <i>visible</i> empire.
        </p>
        <h4>1 · Build the score</h4>
        <p>
          Ranking score is the empire a passing traveller would see: <b>civilian population, regular
          troops, walls</b> (level² × integrity), <b>levelled buildings, banked treasury</b> (gold +
          resources), <b>army experience</b>, and the <b>7 ranked research fields</b>. Siege gear,
          spies, scouts, mercenaries and the 3 shadow research fields add <b>nothing</b> — power in
          the shadows brings no prestige.
        </p>
        <h4>2 · Cross the population floor</h4>
        <p>
          The clocks only tick while you sit at <b>#1</b> <i>and</i> hold above{" "}
          <b>{fmt(ARMY_FLOORS.INDIVIDUAL)}</b> regulars (footmen, archers, cavalry — mercs
          never count). Below the floor the clocks <b>freeze</b> even at #1 (the ladder footer tells
          you when a leader is frozen).
        </p>
        <h4>3 · Run the two clocks</h4>
        <ul>
          <li>
            <b>{HOLD_CLOCKS.CUMULATIVE_HOURS}h cumulative</b> at #1 — this clock <b>never resets</b>,
            it just adds up every hour you spend on top.
          </li>
          <li>
            <b>{HOLD_CLOCKS.STREAK_HOURS}h unbroken</b> at #1 — this streak <b>resets to zero</b> the
            moment anyone knocks you off the throne.
          </li>
          <li>
            So the game isn&apos;t <i>reaching</i> #1 — it&apos;s <b>defending</b> it. Expect rivals
            to bombard your walls, revenge-kill your regulars, and scatter your peasants to break
            your streak and drop you below the floor.
          </li>
        </ul>
        <h4>The clan clock</h4>
        <p>
          A clan wins on the same two clocks for the <b>#1 clan</b> (score = every member&apos;s
          score + clan buildings), held with <b>{fmt(ARMY_FLOORS.CLAN)}</b> regulars across its members.
          Beating the leading clan in a <b>clan war freezes their clocks for 48h</b> — a direct play
          against their win.
        </p>
      </Guide>

      <Guide id="revenge" title="🗡️ Effective Revenge — the troop-killer's tool" illo="units/cavalry">
        <p>
          <b>Revenge</b> opens for <b>{REVENGE_WINDOW_HOURS} hours</b> after <i>anyone</i> attacks
          you, and it&apos;s the single most surgical weapon in the game — launch it from that
          empire&apos;s row on the <Link href="/rankings">ladder</Link>.
        </p>
        <h4>Why it&apos;s special</h4>
        <ul>
          <li>
            It <b>ignores the rules that stop normal attacks</b>: their vacation, their exhaustion,
            their broken walls, and even the &ldquo;too strong to attack&rdquo; refusal — so you can
            strike a target far <i>above</i> your weight. Alone among attacks, it also gives them{" "}
            <b>no chance to yield</b>: however beaten they are, the fight is real and their regulars
            die.
          </li>
          <li>
            It takes <b>no loot</b>. Its only purpose is to <b>kill regulars</b> — the deepest wound
            in the game (permanent population, score, and experience loss for them).
          </li>
          <li>
            It <b>chains</b>: striking re-arms <i>their</i> revenge window back at you, so a revenge
            trade goes both ways — make yours count and be ready to defend the return blow.
          </li>
        </ul>
        <h4>Landing it well</h4>
        <ul>
          <li>
            Bring <b>enough force to punch through their mercs</b> into the regulars — rest to full
            stamina and field your heaviest troops for the most kills per bed.
          </li>
          <li>
            <b>Anti-Overlord combo:</b> revenge the leader repeatedly to drop their regulars below
            the <b>30%-of-civilians</b> guard line; their peasants then scatter at dawn, crashing
            the score and freezing the victory clock. This is how a pack pulls down a runaway #1.
          </li>
        </ul>
      </Guide>

      <Guide id="market-mastery" title="⚖️ Using the Market — the Grand Bazaar" illo="workers/merchants">
        <p>
          The <Link href="/market">Grand Bazaar</Link> is one <b>anonymous, server-wide</b> market —
          you always trade with <i>the Bazaar</i>, never a named player, and all supply is other
          empires&apos; caravans.
        </p>
        <h4>Selling</h4>
        <ul>
          <li>
            Assign <b>merchants</b> on the <Link href="/train">Workers</Link> page, then send a
            caravan: pick a resource, an amount (≤ capacity = <b>1,000 × Market Square level</b>),
            and an ask price per unit — a whole number in the <b>{MARKET_PRICE_MIN}–{MARKET_PRICE_MAX}</b>{" "}
            gold band. One merchant rides per caravan.
          </li>
          <li>
            <b>Caravans travel before they sell.</b> Goods don&apos;t hit the Bazaar the instant you
            dispatch — the road takes <b>100 turns at Market Square level 1, down to 10 at level 10</b>.
            The market page shows each caravan&apos;s journey and ETA; en-route goods aren&apos;t
            buyable and don&apos;t count toward price or supply yet.
          </li>
        </ul>
        <h4>Buying</h4>
        <ul>
          <li>
            Each resource shows one number — the <b>cheapest arrived ask</b>. You buy N units and it
            fills <b>cheapest-first</b>, climbing into pricier caravans as the cheap ones empty.
            Caravans still on the road can&apos;t fill you.
          </li>
          <li>
            A <b>{MARKET_FEE * 100}% fee on every sale is burned</b> — the gold sink that keeps
            prices meaningful.
          </li>
          <li>
            <b>Recalling costs you half the load.</b> You can turn a caravan around at any point and
            the merchant is freed, but only <b>50%</b> of the remaining goods reach your stores. The
            road is not a safe-deposit box: goods parked there to dodge a raid cost you more than
            the raid would have.
          </li>
        </ul>

        <h4>The Black Market — when you can&apos;t wait</h4>
        <p>
          The <Link href="/blackmarket">Black Market</Link> is the <b>fence</b>: you deal with the
          system, not another empire, and it settles <b>instantly</b>. No caravan, no road, no
          counterparty. You pay for that in price — it is the worst deal in the realm, on purpose.
        </p>
        <ul>
          <li>
            It <b>pays {BLACK_MARKET.SELL_PRICE}</b> gold a unit and <b>sells at{" "}
            {BLACK_MARKET.BUY_PRICE}</b>. The Bazaar trades between{" "}
            <b>{MARKET_PRICE_MIN}</b> and <b>{MARKET_PRICE_MAX}</b> — so a player caravan is{" "}
            <i>always</i> the better deal on both sides. Patience is literally worth gold.
          </li>
          <li>
            That spread also means there is <b>no way to farm it</b>: every round trip through the
            fence loses money. Use it when you need gold <i>this turn</i> to finish a building, or
            bread <i>this turn</i> to stop starving — never as a business.
          </li>
          <li>
            It also runs the <b>breaker&apos;s yard</b>: sell siege engines for{" "}
            {Math.round(SIEGE_SALVAGE_VALUE * 100)}% of their build cost, scaled by condition. Mend
            them first — a wreck salvages for less.
          </li>
        </ul>
      </Guide>

      <Guide id="rich" title="💰 Getting Rich — turning bulk into a war chest" illo="resources/gold">
        <p>
          <b>Coin is plentiful; goods are not.</b> Taxes pour gold in, but the fastest fortunes
          are <i>traded</i>, not taxed — the market is how you convert a mountain of ore into the
          gold that buys armies.
        </p>
        <ul>
          <li>
            <b>Overproduce, then sell the surplus.</b> Stack farmers/quarrymen/miners/lumberjacks,
            keep tax moderate so producers stay productive, and ship everything you don&apos;t need
            to the Bazaar for gold you could never mint from tax alone.
          </li>
          <li>
            <b>Undercut to sell first.</b> Buyers fill the cheapest ask first, so set your price a
            hair <i>below</i> the current lowest — your caravan clears before pricier rivals&apos; do.
          </li>
          <li>
            <b>Buy low, sell high.</b> Peace-time gluts crash prices; war zones starve and prices
            spike. Watch the <Link href="/market">price-history charts</Link>: stockpile cheap in
            quiet times, dump into the wartime spike.
          </li>
          <li>
            <b>Invest in the Market Square.</b> Each level means bigger caravans <i>and</i> a faster
            road — you flip more goods, more often. It compounds: a merchant empire out-earns a
            tax-only one many times over.
          </li>
          <li>
            <b>Bank your winnings.</b> Gold sitting loose is lootable — park it in the{" "}
            <b>Counting House</b> so a raid can&apos;t take it, then spend on troops, mercs, and
            siege gear.
          </li>
        </ul>
        <p className="guide-tip">
          💡 The merchant&apos;s loop: mass producers → moderate tax → undercut the market →
          bank the gold → raise the Market Square → repeat, bigger each time.
        </p>
      </Guide>

      <Panel title="Ready?">
        <p style={{ fontSize: 14.5 }}>
          Head back to your <Link href="/">Command View</Link> and watch the{" "}
          <Link href="/guide#winning">race to the throne</Link>. The ladder is the world.
        </p>
      </Panel>
    </>
  );
}
