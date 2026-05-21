import Image from "next/image";
import { useTranslations } from "next-intl";
import { Section } from "@/components/ui/section";
import { Bubble } from "@/components/common/bubble";
import { RevealHeader } from "@/components/common/reveal-header";
import { RevealPolaroids } from "@/components/common/reveal-polaroids";
import { HeartIcon, BoltIcon, BookIcon } from "@/components/icons";
import styles from "./travel-companions.module.scss";

interface Companion {
  name: string;
  url: string;
  logo: string;
  descriptionKey: string;
  frameBg?: string;
}

const COMPANIONS: Companion[] = [
  {
    name: "Wapu",
    url: "https://wapu.com.ar",
    logo: "https://avatars.githubusercontent.com/u/161655811?s=128&v=4",
    descriptionKey: "wapuDescription",
  },
  {
    name: "La Crypta",
    url: "https://lacrypta.ar",
    logo: "https://github.com/lacrypta.png?size=256",
    descriptionKey: "laCryptaDescription",
  },
  {
    name: "Nostr WoT",
    url: "https://nostr-wot.com/",
    logo: "/images/companions/nostr-wot.webp",
    descriptionKey: "nostrWotDescription",
  },
  {
    name: "Mapping Bitcoin",
    url: "https://mappingbitcoin.com/",
    logo: "/images/companions/mapping-bitcoin.svg",
    descriptionKey: "mappingBitcoinDescription",
    frameBg: "#0D0D0D",
  },
  {
    name: "Obelisk",
    url: "https://obelisk.ar/",
    logo: "/images/companions/obelisk.png",
    descriptionKey: "obeliskDescription",
  },
  {
    name: "LaWallet",
    url: "https://lawallet.ar/",
    logo: "https://github.com/lawalletio.png?size=256",
    descriptionKey: "laWalletDescription",
  },
];

export function TravelCompanions() {
  const t = useTranslations("landing.companions");

  return (
    <Section id="travel-companions" className={styles.section}>
      <Bubble
        size={70}
        color="gold"
        variant="icon"
        icon={<HeartIcon />}
        opacity={0.3}
        position={{ top: "10%", left: "5%" }}
        animation="float"
        delay={0}
      />
      <Bubble
        size={48}
        color="lime"
        variant="icon"
        icon={<BookIcon />}
        opacity={0.28}
        position={{ top: "20%", right: "7%" }}
        animation="drift"
        delay={1.4}
      />
      <Bubble
        size={36}
        color="pink"
        variant="solid"
        opacity={0.18}
        position={{ bottom: "28%", left: "12%" }}
        animation="float-slow"
        delay={0.6}
      />
      <Bubble
        size={56}
        color="blue"
        variant="icon"
        icon={<BoltIcon />}
        opacity={0.3}
        position={{ bottom: "18%", right: "9%" }}
        animation="float"
        delay={2.1}
      />
      <Bubble
        size={28}
        color="cyan"
        variant="solid"
        opacity={0.22}
        position={{ top: "55%", left: "3%" }}
        animation="drift"
        delay={3.2}
      />

      <RevealHeader
        className={styles.header}
        titleClassName={styles.title}
        subtitleClassName={styles.subtitle}
        title={t("title")}
        subtitle={t("subtitle")}
        viewportMargin="-25% 0px"
      />

      <RevealPolaroids
        className={styles.board}
        itemClassName={styles.boardItem}
        ariaLabel={t("listLabel")}
        viewportMargin="-30% 0px"
        delay={0.4}
      >
        {COMPANIONS.map((c) => (
          <a
            key={c.name}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.polaroid}
          >
            <div
              className={styles.photoFrame}
              style={c.frameBg ? { background: c.frameBg } : undefined}
            >
              <Image
                src={c.logo}
                alt={c.name}
                width={256}
                height={256}
                className={styles.photo}
              />
            </div>
            <div className={styles.caption}>
              <h3 className={styles.name}>{c.name}</h3>
              <p className={styles.description}>{t(c.descriptionKey)}</p>
            </div>
          </a>
        ))}
      </RevealPolaroids>
    </Section>
  );
}

export default TravelCompanions;
