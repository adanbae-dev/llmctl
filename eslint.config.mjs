// Minimal flat config. `eslint-config-next` + FlatCompat crashes under ESLint 10
// (circular-structure error in legacy config validation), and Next 16 no longer
// runs ESLint during `next build`. Correctness is enforced by `npm run typecheck`
// (tsc --noEmit); this config just keeps `eslint .` runnable without crashing.
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'dist/**', 'out/**'],
  },
]
