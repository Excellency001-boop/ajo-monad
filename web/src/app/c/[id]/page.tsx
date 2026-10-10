import { Suspense } from "react";
import { CircleView } from "@/components/CircleView";

export default function CirclePage() {
  return (
    <Suspense fallback={<p className="mt-16 text-center text-ink-soft">Loading circle…</p>}>
      <CircleView />
    </Suspense>
  );
}
