// Jest setup file
require("@testing-library/jest-dom");

// Mock TextEncoder and TextDecoder for Node.js environment
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock import.meta.env
process.env.VITE_API_GATEWAY_ENDPOINT = "https://test-api-endpoint.com";

// Mock import.meta
global.import = {
  meta: {
    env: {
      VITE_API_GATEWAY_ENDPOINT: process.env.VITE_API_GATEWAY_ENDPOINT,
      NODE_ENV: "test",
    },
  },
};

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {
    return null;
  }
  unobserve() {
    return null;
  }
  disconnect() {
    return null;
  }
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {
    return null;
  }
  unobserve() {
    return null;
  }
  disconnect() {
    return null;
  }
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: MockResizeObserver,
});

// Mock WebGL context
HTMLCanvasElement.prototype.getContext = jest.fn(() => {
  return {
    clearColor: jest.fn(),
    clearDepth: jest.fn(),
    clear: jest.fn(),
    enable: jest.fn(),
    viewport: jest.fn(),
    getExtension: jest.fn(() => null),
    getParameter: jest.fn(() => null),
    getShaderPrecisionFormat: jest.fn(() => ({
      precision: 1,
      rangeMin: 1,
      rangeMax: 1,
    })),
  };
});

// Mock SpeechSynthesis
global.SpeechSynthesisUtterance = class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
  }
};

global.speechSynthesis = {
  speak: jest.fn(),
  cancel: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  getVoices: jest.fn(() => []),
};

// Mock window.confirm
global.confirm = jest.fn(() => true);

// Mock console.error to fail tests on prop type warnings but allow act() warnings
const originalConsoleError = console.error;
console.error = (...args) => {
  // Check if the error is a prop type warning
  const isPropTypeWarning = args.some(
    (arg) =>
      typeof arg === "string" && arg.includes("Warning: Failed prop type"),
  );

  // Check if the error is an act() warning
  const isActWarning = args.some(
    (arg) =>
      typeof arg === "string" && 
      (arg.includes("An update to") && arg.includes("inside a test was not wrapped in act(...)")) ||
      arg.includes("When testing, code that causes React state updates should be wrapped into act(...)")
  );

  if (isPropTypeWarning) {
    throw new Error(args.join(" "));
  }

  // Log act() warnings but don't fail the test
  if (isActWarning) {
    // Suppress act() warnings in test environment to reduce noise
    return;
  }

  originalConsoleError(...args);
};
