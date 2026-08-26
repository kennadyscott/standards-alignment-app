/* Supabase connection. Both values are PUBLIC by design and belong in the page:
   the anon key identifies the project, it does not grant access. Every table has
   row-level security requiring a signed-in user, verified before this shipped —
   an anonymous read returns [] and an anonymous write returns 401.

   The service_role key is a different thing entirely and must never appear here. */
const SUPABASE_URL = 'https://fcztwatbrktydtgqjzpf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjenR3YXRicmt0eWR0Z3FqenBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjIwMjMsImV4cCI6MjEwMzMzODAyM30.SwYujI3zOdVKD0do3GzQ6r5RFguhfLGjnlr_KdxXqK4';
