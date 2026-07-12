import Image from "next/image";

const photos = [
  { src: "/teams/maroon/collage/02-swing-pose.jpg", alt: "Nate Wojciechowski following through on a tee shot" },
  { src: "/teams/maroon/collage/03-pink-polos.jpg", alt: "Two Team Maroon players at Danzante Bay" },
  { src: "/teams/maroon/collage/04-swing-cloudy.jpg", alt: "A player teeing off under storm clouds" },
  { src: "/teams/maroon/collage/05-walk-thumbsup.jpg", alt: "A player giving a thumbs up on Dinah's Walk of Champions" },
  { src: "/teams/maroon/collage/06-walk-walking.jpg", alt: "A player walking Dinah's Walk of Champions" },
  { src: "/teams/maroon/collage/07-medallion.jpg", alt: "Two players posing with a tournament medallion" },
];

export function MaroonCollage() {
  return (
    <aside className="hidden lg:block">
      <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-gold-400 shadow-lg">
        <Image
          src="/teams/maroon/collage/01-hero-team.jpg"
          alt="Team Maroon lined up in their blazers"
          fill
          sizes="(min-width: 1024px) 640px, 0px"
          className="object-cover"
          priority
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {photos.map((photo) => (
          <div key={photo.src} className="relative aspect-square overflow-hidden rounded-md border border-ink-100">
            <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 210px, 0px" className="object-cover" />
          </div>
        ))}
      </div>
    </aside>
  );
}
