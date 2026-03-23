import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground text-center p-4">
      <h1 className="font-display text-6xl text-primary font-bold mb-4 drop-shadow-[0_0_15px_rgba(230,40,70,0.5)]">404</h1>
      <h2 className="text-2xl font-semibold mb-6">Dead End</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        The suspect you are tracking has vanished into the London fog. The coordinates provided lead nowhere.
      </p>
      <Link href="/" className="inline-block">
        <Button size="lg">Return to Headquarters</Button>
      </Link>
    </div>
  );
}
