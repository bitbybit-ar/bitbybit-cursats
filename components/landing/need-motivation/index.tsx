import Image from "next/image";
import { useTranslations } from "next-intl";
import { Section } from "@/components/ui/section";
import { ArrowRightIcon } from "@/components/icons";
import { RevealHeader } from "@/components/common/reveal-header";
import { RevealPolaroids } from "@/components/common/reveal-polaroids";
import styles from "./need-motivation.module.scss";

interface MotivationCard {
  href: string;
  imageSrc: string;
  imageAlt: string;
  titleKey: string;
  descriptionKey: string;
  ctaKey: string;
}

const CARDS: MotivationCard[] = [
  {
    href: "https://arena.bitbybit.com.ar",
    imageSrc:
      "https://images.unsplash.com/photo-1606503153255-59d8b8b82176?w=720&q=80",
    imageAlt: "Arena",
    titleKey: "arenaTitle",
    descriptionKey: "arenaDescription",
    ctaKey: "arenaCta",
  },
  {
    href: "https://habits.bitbybit.com.ar",
    imageSrc:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=720&q=80",
    imageAlt: "Habits",
    titleKey: "habitsTitle",
    descriptionKey: "habitsDescription",
    ctaKey: "habitsCta",
  },
];

export function NeedMotivation() {
  const t = useTranslations("landing.motivation");

  return (
    <Section id="motivacion">
      <RevealHeader
        className={styles.header}
        titleClassName={styles.title}
        subtitleClassName={styles.subtitle}
        title={t("title")}
        subtitle={t("subtitle")}
        viewportMargin="-35% 0px"
      />

      <RevealPolaroids
        className={styles.board}
        itemClassName={styles.boardItem}
        ariaLabel={t("listLabel")}
        viewportMargin="-25% 0px"
        delay={0.6}
      >
        {CARDS.map((card) => (
          <a
            key={card.href}
            href={card.href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.polaroid}
          >
            <div className={styles.photoFrame}>
              <Image
                src={card.imageSrc}
                alt={card.imageAlt}
                width={420}
                height={280}
                className={styles.photo}
              />
            </div>
            <div className={styles.caption}>
              <h3 className={styles.name}>{t(card.titleKey)}</h3>
              <p className={styles.description}>{t(card.descriptionKey)}</p>
              <span className={styles.cta}>
                {t(card.ctaKey)} <ArrowRightIcon size={14} />
              </span>
            </div>
          </a>
        ))}
      </RevealPolaroids>
    </Section>
  );
}

export default NeedMotivation;
