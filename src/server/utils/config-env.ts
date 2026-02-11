import { config } from 'dotenv'

import { getEnvVariable } from '#src/utils/env.js'

const nodeEnv = getEnvVariable('NODE_ENV') || 'development'
config({ path: `.env.${nodeEnv}` })