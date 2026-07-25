// Wires @testing-library/jest-dom's custom matchers (toBeInTheDocument,
// toBeEnabled, toBeDisabled, ...) into TypeScript's view of Jest's Matchers
// interface. jest.setup.js imports '@testing-library/jest-dom' for the
// runtime side-effect, but that file is plain JS and isn't part of the TS
// program, so `tsc --noEmit` never sees the ambient module augmentation
// without this reference.
import '@testing-library/jest-dom';
