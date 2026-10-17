/** Kept free of `vscode` imports so unit tests can use it. */
export const DEFAULT_IGNORE_GLOBS = [
  '**/*.lock',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/pubspec.lock',
  '**/*.g.dart',
  '**/*.freezed.dart',
  '**/*.mocks.dart',
  '**/*.min.js',
  '**/*.map',
  '**/dist/**',
  '**/build/**',
];
