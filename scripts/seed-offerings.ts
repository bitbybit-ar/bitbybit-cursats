import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, and } from "drizzle-orm";
import { users, offerings } from "@/lib/db/schema";
import { resolveSeedPubkey, ALL_ZEROS_PUBKEY } from "./seed-pubkey";

// Same dotenv precedence as scripts/migrate.ts so a single
// MIGRATE_ENV_FILE/.env.local/.env file drives both commands.
const envFile = process.env.MIGRATE_ENV_FILE;
if (envFile) config({ path: envFile });
config({ path: ".env.local" });
config({ path: ".env" });

// Marketplace pivot (ADRs 0012, 0016): every offering belongs to a
// user. The seed inserts a single example user and attaches the
// sample offerings to it. The owner pubkey comes from SEED_PUBKEY
// (resolveSeedPubkey) — set it to your own npub/hex to own the demo
// offerings and manage them from /my-courses after signing in;
// leave it unset and the offerings land on the all-zeros demo user
// so a fresh install still has a browsable catalog.
const SEED_USER = {
  slug: "demo",
  display_name: "Profe Demo",
  bio:
    "Cuenta de ejemplo. Sirve para probar el catálogo de Cursats " +
    "antes de que profesores reales publiquen sus clases.",
  // Placeholder Wapu destination for the demo seller. The buyer-side
  // deposit leg works against Wapu staging, but the seller payout leg
  // would fail against this alias — there is no real Wapu account
  // behind it (and no mock client; getWapuClient always builds the
  // real client per ADR 0025).
  alias: "demo.cursats.ar",
  cbu: null,
  active: true,
};

const SAMPLE_OFFERINGS = [
  {
    slug: "clase-particular-matematica",
    type: "code" as const,
    title: "Clase particular de matemática",
    description:
      "Una hora de clase 1-a-1 con un profesor de matemática del " +
      "secundario. Coordinás el horario por mensaje y recibís un " +
      "código de canje al pagar. Ideal para repasar antes de un " +
      "examen o desbloquear un tema puntual.",
    price_amount: 8000,
    price_currency: "ars" as const,
    image_url: null,
    code_pool: ["DEMO-A1B2", "DEMO-C3D4"],
  },
  {
    slug: "taller-introduccion-bitcoin",
    type: "code" as const,
    title: "Taller: introducción a Bitcoin",
    description:
      "Taller grupal de 90 minutos sobre los fundamentos de " +
      "Bitcoin y Lightning. Online, los miércoles 19hs. Tu código " +
      "de canje te da acceso al próximo cupo disponible.",
    price_amount: 5000,
    price_currency: "ars" as const,
    image_url: null,
    code_pool: ["DEMO-E5F6", "DEMO-G7H8"],
  },
  {
    slug: "guia-pdf-finanzas-personales",
    type: "download" as const,
    title: "Guía PDF: finanzas personales para profesores",
    description:
      "Cuadernillo de 32 páginas con planillas, ejemplos y un " +
      "checklist para ordenar tus ingresos y gastos como docente. " +
      "Descarga inmediata después de pagar.",
    price_amount: 2500,
    price_currency: "ars" as const,
    image_url: null,
    download_url: "https://example.com/guia-finanzas.pdf",
  },
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  const pubkey = resolveSeedPubkey();
  if (pubkey === ALL_ZEROS_PUBKEY) {
    console.log(
      "SEED_PUBKEY not set — seeding under the all-zeros demo user " +
        "(nobody can sign in as it). Set SEED_PUBKEY to your npub/hex " +
        "pubkey to own the offerings and manage them from /my-courses."
    );
  } else {
    console.log(`Seeding offerings under SEED_PUBKEY=${pubkey}`);
  }

  // Ensure the seed user exists. Idempotent — re-runs of the seed
  // script will skip if the row is already there. When SEED_PUBKEY
  // matches a real account you've already signed into, the offerings
  // attach to that existing row rather than creating a "demo" one.
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.pubkey, pubkey))
    .limit(1);
  let user = existingUser;
  if (!user) {
    const [inserted] = await db
      .insert(users)
      .values({ ...SEED_USER, pubkey })
      .returning();
    user = inserted;
    console.log(`Seed user inserted: slug=${user.slug}`);
  } else {
    console.log(`Seed user present: slug=${user.slug}`);
  }

  let inserted = 0;
  let skipped = 0;
  for (const row of SAMPLE_OFFERINGS) {
    // Slug is unique per (user_id, slug); check the pair before
    // inserting so the script stays idempotent.
    const [existing] = await db
      .select({ id: offerings.id })
      .from(offerings)
      .where(and(eq(offerings.user_id, user.id), eq(offerings.slug, row.slug)))
      .limit(1);
    if (existing) {
      skipped += 1;
      continue;
    }
    await db.insert(offerings).values({ ...row, user_id: user.id });
    inserted += 1;
  }
  console.log(
    `Seed complete: ${inserted} offering(s) inserted, ${skipped} already present`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
