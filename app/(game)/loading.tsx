/**
 * Instant parchment skeleton shown while a game page's server render is in
 * flight — the navigation feels immediate even when the world is loading.
 */
export default function GameLoading() {
  return (
    <div className="skel" aria-hidden="true">
      <div className="skel-panel">
        <div className="skel-head" />
        <div className="skel-body">
          <div className="skel-line w60" />
          <div className="skel-line w90" />
          <div className="skel-line w75" />
        </div>
      </div>
      <div className="skel-panel">
        <div className="skel-head" />
        <div className="skel-body">
          <div className="skel-line w90" />
          <div className="skel-line w80" />
          <div className="skel-line w60" />
          <div className="skel-line w85" />
        </div>
      </div>
    </div>
  );
}
