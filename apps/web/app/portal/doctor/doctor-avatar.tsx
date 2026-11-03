import React from 'react';

interface DoctorAvatarProps {
  gender?: 'male' | 'female';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  name?: string;
}

export function DoctorAvatar({
  gender = 'male',
  size = 'md',
  className = '',
  name,
}: DoctorAvatarProps) {
  // Size mapping
  const sizeMap = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
    xl: 'w-40 h-40',
  };

  const isMale = gender === 'male';

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-gradient-to-b from-sky-50 via-slate-50 to-blue-100/70 border border-sky-100/80 shadow-xs flex items-center justify-center shrink-0 ${sizeMap[size]} ${className}`}
    >
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full object-cover"
      >
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f0f9ff" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
          <linearGradient id="coatGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>
          <linearGradient id="innerShirt" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isMale ? '#0284c7' : '#0d9488'} />
            <stop offset="100%" stopColor={isMale ? '#0369a1' : '#0f766e'} />
          </linearGradient>
          <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fcd34d" stopOpacity="0.4" />
            <stop offset="40%" stopColor="#fed7aa" />
            <stop offset="100%" stopColor="#fdba74" />
          </linearGradient>
          <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
        </defs>

        {/* Soft background glow */}
        <circle cx="60" cy="60" r="54" fill="url(#bgGrad)" />

        {/* Subtle medical cross watermark in background */}
        <path
          d="M56 24h8v8h-8zM56 40h8v8h-8zM48 32h24v8H48z"
          fill="#38bdf8"
          fillOpacity="0.12"
        />

        {/* Neck */}
        <path d="M52 64h16v14h-16z" fill="#fed7aa" />

        {/* Head / Face */}
        <ellipse cx="60" cy="52" rx="17" ry="20" fill="#fed7aa" />

        {/* Hair */}
        {isMale ? (
          <path
            d="M43 48c0-14 9-22 17-22s17 8 17 22c0 3-1 6-2 8-2-8-6-13-15-13-8 0-14 4-16 11-1-2-1-4-1-6z"
            fill="url(#hairGrad)"
          />
        ) : (
          <path
            d="M41 54c-1-16 8-28 19-28s19 12 19 28c0 10-3 16-5 18-1-10-3-18-14-18s-13 8-14 18c-2-2-5-8-5-18z"
            fill="url(#hairGrad)"
          />
        )}

        {/* Glasses (Clinical precision touch) */}
        <g stroke="#475569" strokeWidth="1.2" fill="none">
          <circle cx="53" cy="52" r="5.5" />
          <circle cx="67" cy="52" r="5.5" />
          <line x1="58.5" y1="52" x2="61.5" y2="52" />
          <line x1="47.5" y1="51.5" x2="43" y2="50" />
          <line x1="72.5" y1="51.5" x2="77" y2="50" />
        </g>
        {/* Eyes behind lenses */}
        <circle cx="53" cy="52" r="1.5" fill="#1e293b" />
        <circle cx="67" cy="52" r="1.5" fill="#1e293b" />

        {/* Gentle medical smile */}
        <path
          d="M56 61q4 3 8 0"
          stroke="#b45309"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* White Doctor Coat Body */}
        <path
          d="M24 116c2-28 14-40 36-40s34 12 36 40H24z"
          fill="url(#coatGrad)"
          stroke="#cbd5e1"
          strokeWidth="1"
        />

        {/* Inner Scrub / Collar */}
        <path d="M50 76l10 14 10-14v-2H50v2z" fill="url(#innerShirt)" />
        <path
          d="M50 76l10 14 10-14"
          stroke="#bae6fd"
          strokeWidth="1"
          fill="none"
        />

        {/* Stethoscope */}
        <path
          d="M47 77c-2 6-2 15 3 20s13 5 18 1c4-3 5-11 5-21"
          stroke="#0284c7"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="68" cy="98" r="4" fill="#0369a1" stroke="#e0f2fe" strokeWidth="1.5" />
        <circle cx="68" cy="98" r="1.5" fill="#38bdf8" />

        {/* Doctor Coat Lapels */}
        <path
          d="M40 76l14 26-10 14M80 76l-14 26 10 14"
          stroke="#94a3b8"
          strokeWidth="1.2"
          fill="none"
        />

        {/* ID Badge on Coat */}
        <rect
          x="35"
          y="92"
          width="12"
          height="16"
          rx="1.5"
          fill="#ffffff"
          stroke="#94a3b8"
          strokeWidth="0.8"
        />
        <rect x="37" y="94" width="8" height="2" fill="#0284c7" />
        <line x1="37" y1="99" x2="45" y2="99" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="37" y1="102" x2="43" y2="102" stroke="#cbd5e1" strokeWidth="1" />
      </svg>

      {/* Verified Micro Badge in corner */}
      <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs border-2 border-white ring-1 ring-emerald-200">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}
