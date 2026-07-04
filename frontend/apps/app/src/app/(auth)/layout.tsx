export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      {/* A whisper of depth — nothing louder (no grids, no light blobs). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(90% 55% at 50% 0%, #EFEBE2 0%, transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-[400px]">{children}</div>
    </div>
  );
}
