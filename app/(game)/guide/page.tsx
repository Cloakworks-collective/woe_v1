import Link from "next/link";
import { Art } from "@/components/Art";
import { Panel } from "@/components/Panel";
import {
  ERA_PEACE_DAYS,
  HOLD_CLOCKS,
  POPULATION_FLOORS,
  TURNS_PER_DAY,
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
          <Link href="#winning">🏆 Winning the Era</Link>
          <Link href="#grow">🌱 How to Grow</Link>
          <Link href="#army">⚔️ Building an Army</Link>
          <Link href="#battle">🔥 Battle Strategies</Link>
          <Link href="#shadows">🗡️ Spies &amp; Scouts</Link>
          <Link href="#clans">🛡️ Clans</Link>
          <Link href="#defense">🏰 Defending the Realm</Link>
          <Link href="#strategy">🎯 Strategy &amp; First Days</Link>
        </div>
      </Panel>

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
            The clocks only tick while you are above <b>{fmt(POPULATION_FLOORS.GRAND_OVERLORD)}</b>{" "}
            population (civilians + regular troops — mercenaries never count).
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
          <b>{fmt(POPULATION_FLOORS.CLAN)}</b> total population. Losing a clan war freezes the clocks
          for 48 hours, so beating the leading clan is a direct play against their win.
        </p>
        <h4>What the ranking score measures — the visible empire</h4>
        <p>
          Your score is what a traveller riding through would see. <b>It counts:</b> civilian
          population, regular troops, wall level (scaled by integrity), levelled buildings, treasury
          (gold + resources), army experience, and <b>7 of the 10 research fields</b>.
        </p>
        <p>
          <b>It counts for nothing:</b> siege engines &amp; engineers, spies &amp; scouts,
          mercenaries, and the three &ldquo;shadow&rdquo; research fields (Siegecraft, Tradecraft,
          Pathfinding). <b>Power in the shadows brings no prestige</b> — to win you must build the
          visible empire, then protect it. See the live race on your{" "}
          <Link href="/">Command View</Link> and the full <Link href="/rankings">ladder</Link>.
        </p>
      </Guide>

      <Guide id="grow" title="🌱 How to Grow — economy, population, research" illo="workers/farmers">
        <p>
          One turn is <b>10 minutes</b>; a full day is <b>{TURNS_PER_DAY} turns</b>. Everything below
          runs every turn while you&apos;re offline.
        </p>
        <h4>Peasants → workers or soldiers</h4>
        <p>
          New settlers arrive every dawn (from <b>1/day up to 100/day</b> as you raise civilian
          buildings). On the <Link href="/train">Workers &amp; Levy</Link> page you assign peasants
          as <b>workers</b> (who produce gold &amp; resources every turn) or train them into{" "}
          <b>military</b>, <b>spies</b>, or <b>scouts</b>.
        </p>
        <h4>The tax dial — your gold engine</h4>
        <ul>
          <li>
            Tax runs <b>0–100%</b>. Higher tax = more gold, but your producers make fewer resources
            (they&apos;re the same workers). Around <b>29 gold per citizen per day</b> at the 50%
            default. Set it on the <Link href="/">Command View</Link>.
          </li>
          <li>
            <b>Gold is scarce, resources are bulk.</b> Gold buys troops, mercenaries, and siege gear;
            resources build and equip. Bank gold in the Counting House so it can&apos;t be looted.
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
          <Link href="/research">The Collegium</Link> has <b>10 fields × 5 levels</b>, each level
          five times costlier than the last, so you must <b>specialise</b>. Seven fields (farming,
          forestry, masonry, smelting, and the war arts) also raise your ranking score; the three
          shadow fields do not.
        </p>
        <p className="guide-tip">
          💡 Early game: raise housing + production, keep food positive, pick <b>one</b> research
          lane, and stay under a shield or the era peace while you build a base.
        </p>
      </Guide>

      <Guide id="army" title="⚔️ Building an Army — troops, tiers, mercenaries" illo="units/footman">
        <p>
          Train warriors on <Link href="/train">Workers &amp; Levy</Link>, then <b>equip</b> them on{" "}
          <Link href="/troops">The Army</Link> into the three combat classes, each at light → medium
          → heavy tiers (heavier = more power, more resources &amp; ore):
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
          Hire mercs on <Link href="/troops">The Army</Link> for instant strength. They{" "}
          <b>die before your regulars</b> (a shield for your veterans) but cost <b>gold every turn</b>{" "}
          or they defect, and are capped at <b>25% of your regular army</b>. They never count toward
          your score or the population floors.
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
          straight from each empire&apos;s <b>⚔ Act</b> console there.
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
            surrender, low stamina, and broken walls, and <b>chains</b> (revenge re-arms the
            victim&apos;s window).
          </li>
          <li>
            <b>Bombard</b> — an artillery duel that wrecks <b>walls first</b>, then cracks random
            town buildings once breached. No troops, no loot — it&apos;s pure sabotage of a rival&apos;s
            score.
          </li>
        </ul>
        <h4>How a battle resolves (per round)</h4>
        <p>
          Four phases in order: <b>1. siege weapons</b> (grind walls; the defender&apos;s counters cut
          paired engines by 75%) → <b>2. archers</b> → <b>3. cavalry charge</b> → <b>4. footmen</b>.
          A side breaks when it drops <b>below 30% strength</b>. Every battle has ±10% luck. Raids
          skip the siege phase and give no wall bonus.
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
          from any empire&apos;s <b>⚔ Act</b> console on the <Link href="/rankings">ladder</Link>.
          Send more spies for more damage,
          but higher catch risk; <b>caught spies are executed</b> (you lose the population).{" "}
          <b>Scouts</b> gather recon on rivals and, at home, catch enemy spies — your Ranger&apos;s
          Lodge level sets how skilled a spy they can catch. Spies, scouts, and their research are{" "}
          <b>invisible to the ladder</b>, so this is power without prestige.
        </p>
      </Guide>

      <Guide id="clans" title="🛡️ Clans — strength in numbers" illo="clan/crest">
        <p>
          On the <Link href="/clan">Clan</Link> page you can found (5 founders) or join a clan of up
          to 20. Members feed a shared pool that leadership spends on clan buildings:{" "}
          <b>Clan Storage</b> → <b>Clan Hall</b> (raises the member cap and shrinks the tax
          penalty, down to 50%) → <b>Clan Wonder</b> (discounts troop, merc &amp; siege costs for
          every member).
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
            <b>Install defensive counters</b> at the <Link href="/siege">Siege Works</Link> — each
            cuts a paired enemy engine by 75%.
          </li>
          <li>
            <b>Store your resources &amp; bank your gold</b> — only what&apos;s sheltered survives a
            raid or siege.
          </li>
          <li>
            <b>Keep troops above 30% of civilians</b> so your people never scatter at the reset.
          </li>
          <li>
            <b>Surrender</b> is an option (Command View): you can&apos;t attack and your tax halves,
            but you become immune to everything except revenge.
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

      <Panel title="Ready?">
        <p style={{ fontSize: 14.5 }}>
          Head back to your <Link href="/">Command View</Link> and watch the{" "}
          <Link href="/guide#winning">race to the throne</Link>. The ladder is the world.
        </p>
      </Panel>
    </>
  );
}
