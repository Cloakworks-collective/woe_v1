/**
 * The instant shell for every game route.
 *
 * Every page here is force-dynamic and waits on the world before it can say
 * anything — which used to mean a click held the OLD page frozen until the new
 * one was fully computed. This paints the same parchment furniture in the same
 * places immediately, so navigation reads as "the page is coming" rather than
 * "did that click take?". No data, no client JS — pure skeleton.
 */
export default function GameLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <section className="panel" key={i} style={{ opacity: 1 - i * 0.25 }}>
          <div
            style={{
              height: 18,
              width: i === 0 ? "38%" : "26%",
              borderRadius: 4,
              background: "color-mix(in srgb, var(--heading) 18%, transparent)",
              margin: "4px 0 14px",
            }}
          />
          {[0, 1, 2].map((j) => (
            <div
              key={j}
              style={{
                height: 12,
                width: `${86 - j * 17 - i * 6}%`,
                borderRadius: 4,
                background: "color-mix(in srgb, var(--heading) 9%, transparent)",
                margin: "10px 0",
              }}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
