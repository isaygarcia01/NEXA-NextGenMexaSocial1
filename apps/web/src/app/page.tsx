import { Suspense } from "react";
import { connection } from "next/server";
import HomeFeed from "./home-feed";

async function RequestBoundFeed() {
  await connection();
  return <HomeFeed />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell" aria-busy="true">
          <section className="feed-column">
            <p className="eyebrow">CARGANDO TU ESPACIO…</p>
          </section>
        </main>
      }
    >
      <RequestBoundFeed />
    </Suspense>
  );
}
