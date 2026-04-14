#!/usr/bin/env bun

import { runCli } from "../packages/pi-installer/src/cli.js";

await runCli(process.argv.slice(2));
