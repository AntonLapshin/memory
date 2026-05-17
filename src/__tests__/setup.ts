import { configureLogger } from '../logger.js';

// Disable file-based logging globally for all tests.
configureLogger({ enabled: false });
