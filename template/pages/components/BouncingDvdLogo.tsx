import React, { useState, useEffect, useRef } from "react";

export default function BouncingDvdLogo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cornerHits, setCornerHits] = useState(0);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [velocity, setVelocity] = useState({ x: 2 * 1, y: 1.5 * 1 });
  const [color, setColor] = useState("#8b5cf6");

  const toggleSpeed = () => {
    const newMultiplier = speedMultiplier === 10 ? 1 : 10;
    setSpeedMultiplier(newMultiplier);
    setVelocity((v) => ({
      x: Math.sign(v.x) * 2 * newMultiplier,
      y: Math.sign(v.y) * 1.5 * newMultiplier,
    }));
  };

  const logoWidth = 80;
  const logoHeight = 40;

  const colors = [
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#f59e0b", // amber
    "#10b981", // emerald
    "#3b82f6", // blue
    "#ef4444", // red
  ];

  const getRandomColor = () => {
    const newColor = colors[Math.floor(Math.random() * colors.length)];
    return newColor === color
      ? colors[(colors.indexOf(color) + 1) % colors.length]
      : newColor;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cornerTolerance = 10; // pixels of tolerance for corner detection

    const animate = () => {
      setPosition((prev) => {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        let newX = prev.x + velocity.x;
        let newY = prev.y + velocity.y;
        let hitX = false;
        let hitY = false;

        // Check horizontal bounds
        if (newX <= 0) {
          newX = 0;
          hitX = true;
          setVelocity((v) => ({ ...v, x: Math.abs(v.x) }));
          setColor(getRandomColor());
        } else if (newX >= containerWidth - logoWidth) {
          newX = containerWidth - logoWidth;
          hitX = true;
          setVelocity((v) => ({ ...v, x: -Math.abs(v.x) }));
          setColor(getRandomColor());
        }

        // Check vertical bounds
        if (newY <= 0) {
          newY = 0;
          hitY = true;
          setVelocity((v) => ({ ...v, y: Math.abs(v.y) }));
          if (!hitX) setColor(getRandomColor());
        } else if (newY >= containerHeight - logoHeight) {
          newY = containerHeight - logoHeight;
          hitY = true;
          setVelocity((v) => ({ ...v, y: -Math.abs(v.y) }));
          if (!hitX) setColor(getRandomColor());
        }

        // Corner hit - check if near both edges (with tolerance)
        const nearLeftOrRight =
          newX <= cornerTolerance ||
          newX >= containerWidth - logoWidth - cornerTolerance;
        const nearTopOrBottom =
          newY <= cornerTolerance ||
          newY >= containerHeight - logoHeight - cornerTolerance;

        if ((hitX || hitY) && nearLeftOrRight && nearTopOrBottom) {
          setCornerHits((c) => c + 1);
        }

        return { x: newX, y: newY };
      });
    };

    const intervalId = setInterval(animate, 16);
    return () => clearInterval(intervalId);
  }, [velocity]);

  return (
    <div className="not-prose my-6 mx-12">
      {/* TV outer frame */}
      <div
        className="bg-gradient-to-b from-gray-700 via-gray-800 to-gray-900 p-3 rounded-2xl shadow-xl cursor-pointer"
        onClick={toggleSpeed}
      >
        {/* TV screen bezel */}
        <div className="bg-black p-1 rounded-lg">
          {/* Screen container */}
          <div
            ref={containerRef}
            className="relative w-full h-48 rounded overflow-hidden"
            style={{
              background:
                "linear-gradient(145deg, #1a1a2e 0%, #0f0f1a 50%, #1a1a2e 100%)",
            }}
          >
            {/* Corner hits counter in center */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white/20 text-4xl font-mono">
                {cornerHits}
              </span>
            </div>

            {/* Bouncing logo */}
            <div
              className="absolute"
              style={{
                left: position.x,
                top: position.y,
                width: logoWidth,
                height: logoHeight,
              }}
            >
              <div
                className="transition-colors duration-300"
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundColor: color,
                  maskImage: "url(/DVD_logo.svg)",
                  maskSize: "contain",
                  maskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskImage: "url(/DVD_logo.svg)",
                  WebkitMaskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                }}
              />
            </div>

            {/* Screen reflection overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%, transparent 100%)",
              }}
            />
          </div>
        </div>
      </div>
      {/* Prompt text */}
      <p className="text-sm text-gray-500 font-mono mt-3 px-4">
        "Make a component that looks like a TV screen with a bouncing DVD logo.
        Count the number of times...
      </p>
    </div>
  );
}
