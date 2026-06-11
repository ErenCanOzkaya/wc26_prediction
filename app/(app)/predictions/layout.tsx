import { PredictionsTabs } from "@/components/PredictionsTabs";

export default function PredictionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="display rise text-6xl leading-[0.9] sm:text-7xl">
        YOUR
        <br />
        <span className="text-green">PREDICTIONS</span>
      </h1>
      <p className="mt-3 mb-5 max-w-md text-sm text-muted">
        Locks are enforced per match — once a deadline passes, that pick is
        frozen.
      </p>
      <PredictionsTabs />
      {children}
    </div>
  );
}
