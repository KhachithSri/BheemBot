import Image from "next/image";

export function CandidateWelcomeScreen() {
  return (
    <main className="relative min-h-screen min-h-[100dvh] w-full overflow-hidden bg-slate-950">
      <Image
        src="/images/candidate-welcome.png"
        alt="Welcome to Bheem bot"
        fill
        priority
        unoptimized
        sizes="100vw"
        className="object-cover"
      />
    </main>
  );
}
