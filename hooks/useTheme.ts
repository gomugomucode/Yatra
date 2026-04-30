'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  // Dark mode is permanently disabled. We always return light.
  return { theme: 'light', toggle: () => {} };
}
