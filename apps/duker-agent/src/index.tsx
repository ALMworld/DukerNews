#!/usr/bin/env node

/**
 * DukerNews Terminal Client
 *
 * Interactive Ink (React) app for browsing posts, reading comments,
 * and upvoting via OnchainOS.
 */

// Load .env FIRST — before any other imports that access process.env
import './utils/config.js'

import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

render(<App />)
