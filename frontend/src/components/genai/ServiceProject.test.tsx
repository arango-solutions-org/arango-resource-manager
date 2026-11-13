import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import ServiceProject from '@/components/genai/ServiceProject'
import type { GenAiComponent, GenAiProject } from '@/lib/schemas'

const component = (role: GenAiComponent['role'], name: string): GenAiComponent =>
  ({
    role,
    kind: 'Deployment',
    name,
    service: name,
    pod_count: 1,
    ready_pods: 1,
    created_at: '2026-10-19T09:12:00Z',
    chat_model: 'gpt-4o',
    embedding_model: null,
  }) as unknown as GenAiComponent

const project = {
  key: 'arrow_demo/ai-infra',
  project_name: 'ai-infra',
  db_name: 'arrow_demo',
  status: 'paired',
  project: component('project', 'arangodb-autograph-snmyo'),
  retrievers: [component('retriever', 'arangodb-graphrag-retriever-of15b')],
  others: [],
} as unknown as GenAiProject

describe('ServiceProject', () => {
  it('names the project and database a retriever serves, and links its project', () => {
    render(
      <MemoryRouter>
        <ServiceProject service="arangodb-graphrag-retriever-of15b" project={project} />
      </MemoryRouter>,
    )
    expect(screen.getByText('ai-infra')).toBeInTheDocument()
    expect(screen.getByText('arrow_demo')).toBeInTheDocument()
    expect(screen.getByText('GraphRAG retriever')).toBeInTheDocument()
    expect(screen.getByText(/ago$/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /arangodb-autograph-snmyo/ })).toHaveAttribute(
      'href',
      '/services/arangodb-autograph-snmyo',
    )
  })
})
