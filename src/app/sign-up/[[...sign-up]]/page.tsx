import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <main style={{ 
      display: 'grid', 
      placeItems: 'center', 
      minHeight: '100vh', 
      background: 'var(--bg)',
      padding: 'var(--space-6)'
    }}>
      <SignUp 
        appearance={{
          elements: {
            card: 'panel',
            headerTitle: 't-h2',
            headerSubtitle: 't-small t-3',
            formButtonPrimary: 'btn btn-primary btn-lg',
            formFieldLabel: 'field-label',
            formFieldInput: 'input',
            footerActionText: 't-small t-3',
            footerActionLink: 't-small t-a'
          }
        }}
      />
    </main>
  )
}
