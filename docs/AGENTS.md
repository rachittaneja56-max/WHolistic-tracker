# Agents

## Safety model

All agents operate under the same rules:
- use only provided context
- do not invent facts
- do not auto-confirm links
- do not auto-create final knowledge
- do not auto-delete or auto-merge entities
- prefer `no_result` over weak guesses
- return strict JSON when requested

## Duplicate detector

Purpose:
- compare a new or selected entity against candidate neighbors
- suggest whether it looks duplicate, same-pattern, related, or clearly different

Safety:
- never merges entities automatically
- only returns a suggestion payload

## Deep connection agent

Purpose:
- reason over candidate pairs and suggest non-obvious links

Safety:
- stores suggestions as reviewable link records
- confirmed links still require user review

## Daily guidance

Purpose:
- summarize what needs attention today from recall, deadlines, open work, and pending suggestions

Fallback:
- deterministic prioritization if AI is disabled or unavailable

## Recall grader

Purpose:
- grade recall responses against the entity's own saved content
- update confidence and review history

Safety:
- uses only the retrieved entity context
- does not invent missing knowledge

## RAG chat

Purpose:
- answer only from the user's own graph with citations

Safety:
- should explicitly say when the graph does not contain enough context
- must not answer from outside internet knowledge unless a later mode explicitly adds it

## PR to TIL

Purpose:
- turn merged PR activity into a reviewable TIL draft

Safety:
- the backend can draft content
- the user must approve or edit before a final TIL entity is created

## Idea validator

Purpose:
- compare an idea against the user's graph and optional web search results

Safety:
- does not auto-create the idea entity
- approval is a separate step

## Comprehension checks

Purpose:
- test whether AI-assisted work was actually understood

Safety:
- flagged checks surface learning debt
- they do not auto-rewrite tasks or notes

## Analyst agent

Purpose:
- generate a weekly brief from real signals in the graph and activity history
- surface trends, solve-rate patterns, gaps, learning debt, and next-week focus

Inputs:
- DSA captures and revisits
- review scores
- low-confidence topics
- tag coverage gaps
- project shipping vs TIL imbalance
- completed tasks
- flagged comprehension checks
- pending agent-suggested links
- upcoming deadlines

Fallback:
- if AI is disabled or unavailable, the backend returns deterministic trend and gap analysis instead of failing

Safety:
- suggested actions open prefilled capture flows only
- nothing is saved until the user confirms in the form
