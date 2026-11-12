import { describe, expect, it } from 'vitest'

import { apiErrorMessage, mountBase } from '@/lib/api'

describe('apiErrorMessage', () => {
  it('prefers FastAPI detail over the Axios status line', () => {
    const error = Object.assign(new Error('Request failed with status code 404'), {
      response: { data: { detail: 'Not Found' } },
    })
    expect(apiErrorMessage(error)).toBe('Not Found')
  })

  it('prefers a blocked action detail when the body is not a valid result', () => {
    const error = Object.assign(new Error('Request failed with status code 404'), {
      response: { data: { detail: "No pod named 'gone'." } },
    })
    expect(apiErrorMessage(error)).toBe("No pod named 'gone'.")
  })

  it('falls back to the Error message when the body has no detail', () => {
    const error = Object.assign(new Error('Request failed with status code 502'), {
      response: { data: { status: 'Failure' } },
    })
    expect(apiErrorMessage(error)).toBe('Request failed with status code 502')
  })
})

describe('mountBase', () => {
  it('keeps API calls inside the platform mount', () => {
    expect(mountBase('/_service/uds/_global/arango-resource-manager/')).toBe(
      '/_service/uds/_global/arango-resource-manager/',
    )
    expect(mountBase('/_service/uds/_global/arango-resource-manager/index.html')).toBe(
      '/_service/uds/_global/arango-resource-manager/',
    )
  })

  it('is the site root when served locally', () => {
    expect(mountBase('/')).toBe('/')
    expect(mountBase('')).toBe('/')
  })
})
