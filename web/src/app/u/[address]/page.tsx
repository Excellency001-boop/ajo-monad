import { Suspense } from "react";
import { Profile } from "@/components/Profile";

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="mt-16 text-center text-ink-soft">Loading record…</p>}>
      <Profile />
    </Suspense>
  );
}
