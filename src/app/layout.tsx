import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Intention Engine',
  description: 'Deterministic, auditable AI intent execution system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '20px',
        backgroundColor: '#f5f5f5',
        minHeight: '100vh',
      }}>
        <header style={{
          borderBottom: '2px solid #333',
          paddingBottom: '20px',
          marginBottom: '30px',
        }}>
          <h1 style={{ margin: 0, color: '#333' }}>Intention Engine</h1>
          <p style={{ margin: '10px 0 0 0', color: '#666' }}>
            Deterministic, auditable AI intent execution
          </p>
        </header>
        {children}
        <footer style={{
          marginTop: '50px',
          paddingTop: '20px',
          borderTop: '1px solid #ddd',
          color: '#666',
          fontSize: '14px',
        }}>
          <p>
            <strong>Architecture:</strong> LLM reasoning → Schema validation → Deterministic execution
          </p>
          <p>
            <strong>Deployed on:</strong> Vercel Hobby tier | <strong>LLM:</strong> GLM-4.7-flash
          </p>
        </footer>
      </body>
    </html>
  );
}
