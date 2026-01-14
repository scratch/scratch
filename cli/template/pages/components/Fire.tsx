export default function Fire({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-bold bg-gradient-to-t from-red-600 via-orange-500 to-yellow-400 bg-clip-text text-transparent animate-pulse"
    >
      {children}
    </span>
  );
}
