export type FeatureRequest = {
  id: string
  title: string
  description: string
  created_at: string
  votes: number
  voted: boolean
}

export type FeaturePage = { items: FeatureRequest[]; total: number }
