import React from 'react';

export default function Icon({ name, size = 20, ...props }) {
  const paths = {
    route: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="18" r="3" />
        <path d="M9 6h7a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8" />
      </>
    ),
    arrow: <path d="m14 6-6 6 6 6M8 12h13" />,
    swap: <path d="M7 3v16m-4-4 4 4 4-4M17 21V5m-4 4 4-4 4 4" />,
    car: (
      <>
        <path d="m4 9 2-5h12l2 5M3 10h18v8H3zM5 18v3m14-3v3M6 14h2m8 0h2" />
      </>
    ),
    sound: (
      <>
        <path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8z" />,
    locate: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 1v4m0 14v4M1 12h4m14 0h4" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m16 8-2 6-6 2 2-6z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    repeat: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.route}
    </svg>
  );
}
