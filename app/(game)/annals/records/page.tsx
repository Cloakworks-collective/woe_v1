import { redirect } from "next/navigation";

// The living age's war records moved to the Rankings side of the realm —
// the Annals hold only what is sealed.
export default function MovedToRankings() {
  redirect("/rankings/records");
}
