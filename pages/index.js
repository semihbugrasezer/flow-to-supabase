import Link from 'next/link';

export default function Home() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(1200px 500px at 20% -10%, #f5e8cc 0%, transparent 60%), radial-gradient(900px 400px at 90% 10%, #d7efe9 0%, transparent 55%), #f7f4ee',
        color: '#1f2933',
        fontFamily: '"Space Grotesk", "Segoe UI", Tahoma, sans-serif',
        padding: '48px 20px 80px'
      }}
    >
      <div style={{ maxWidth: '980px', margin: '0 auto' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <span
            style={{
              fontSize: '13px',
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              color: '#54636f'
            }}
          >
            Flow → Supabase Auto Uploader
          </span>
          <h1 style={{ fontSize: '44px', lineHeight: '1.1', margin: 0 }}>
            Send every new Flow image to Supabase automatically.
          </h1>
          <p style={{ fontSize: '18px', maxWidth: '680px', color: '#3f4b55', margin: 0 }}>
            The userscript runs in the browser, while the Vercel API handles uploads, compression, and metadata.
            Bookmarklet usage is optional.
          </p>
        </header>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '18px',
            marginTop: '32px'
          }}
        >
          {[
            {
              title: 'Userscript (Automatic)',
              body: 'While Flow is open, new images are detected and uploaded automatically.',
              badge: 'Required'
            },
            {
              title: 'Vercel API',
              body: 'Compression and metadata generation happen here. Duplicate URLs are ignored.',
              badge: 'Required'
            },
            {
              title: 'Bookmarklet',
              body: 'Optional. Use only if you need manual triggering.',
              badge: 'Optional'
            }
          ].map((card) => (
            <div
              key={card.title}
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
                border: '1px solid #e7e2d8'
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: '#efe3d1',
                  fontSize: '11px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#6b5f4e',
                  marginBottom: '12px'
                }}
              >
                {card.badge}
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>{card.title}</h3>
              <p style={{ margin: 0, color: '#4b5863', lineHeight: 1.5 }}>{card.body}</p>
            </div>
          ))}
        </section>

        <section
          style={{
            marginTop: '36px',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: '20px'
          }}
        >
          <div
            style={{
              background: '#111827',
              color: '#f9fafb',
              borderRadius: '16px',
              padding: '22px',
              boxShadow: '0 18px 50px rgba(15, 23, 42, 0.25)'
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px' }}>API Endpoint</h2>
            <p style={{ marginTop: '8px', color: '#d1d5db' }}>
              Uploads are sent to this endpoint:
            </p>
            <div
              style={{
                marginTop: '12px',
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.08)',
                fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
                fontSize: '13px'
              }}
            >
              POST /api/upload-flow-images
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '22px',
              border: '1px solid #e7e2d8'
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px' }}>Bookmarklet (Optional)</h2>
            <p style={{ marginTop: '8px', color: '#4b5863' }}>
              If you need manual triggering, generate a bookmarklet.
            </p>
            <Link href="/bookmarklet-generator" legacyBehavior>
              <a
                style={{
                  display: 'inline-block',
                  marginTop: '12px',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  background: '#d87c32',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                Bookmarklet Generator
              </a>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
