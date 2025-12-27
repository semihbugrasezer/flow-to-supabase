export default function BookmarkletGenerator() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const bucketName = process.env.BUCKET_NAME || 'flow-images';
  
  const bookmarkletCode = `
(async function(){
  const SUPABASE_URL = '${supabaseUrl}';
  const SUPABASE_KEY = 'YOUR_KEY_WILL_BE_INJECTED';
  const BUCKET_NAME = '${bucketName}';
  function compressImage(file, maxWidth = 1920, maxHeight = 1920, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Compression failed'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function uploadToSupabase(blob, fileName, contentType = 'image/jpeg') {
    const uploadUrl = \`\${SUPABASE_URL}/storage/v1/object/\${BUCKET_NAME}/\${fileName}\`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${SUPABASE_KEY}\`,
        'apikey': SUPABASE_KEY,
        'Content-Type': contentType,
        'x-upsert': 'false'
      },
      body: blob
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = \`Upload failed: \${response.status}\`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    const publicUrl = \`\${SUPABASE_URL}/storage/v1/object/public/\${BUCKET_NAME}/\${fileName}\`;
    return publicUrl;
  }
  const findFlowImages = () => {
    const images = [];
    
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.getAttribute('src');
      if (src && (
        src.includes('storage.googleapis.com') ||
        src.includes('ai-sandbox') ||
        src.includes('videofx') ||
        src.includes('flow') ||
        src.match(/\\.(jpg|jpeg|png|webp)$/i)
      )) {
        if (!images.includes(src)) {
          images.push(src);
        }
      }
    });
    
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      const bgImage = style.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const urlMatch = bgImage.match(/url\\(['"]?([^'"]+)['"]?\\)/);
        if (urlMatch) {
          const url = urlMatch[1];
          if (url.includes('storage.googleapis.com') || url.includes('ai-sandbox')) {
            if (!images.includes(url)) {
              images.push(url);
            }
          }
        }
      }
    });
    
    return images;
  };
  
  if (!SUPABASE_URL || SUPABASE_KEY === 'YOUR_KEY_WILL_BE_INJECTED') {
    alert('⚠️ Supabase configuration missing!');
    return;
  }
  
  const imageUrls = findFlowImages();
  
  if (!imageUrls.length) {
    alert('❌ No images found on the Flow page!');
    return;
  }
  
  const confirmed = confirm(
    \`📸 \${imageUrls.length} images found!\\n\\n\` +
    \`They will be compressed in the browser and uploaded directly to Supabase.\\n\\n\` +
    \`Continue?\`
  );
  
  if (!confirmed) return;
  
  const progressDiv = document.createElement('div');
  progressDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:20px 30px;border-radius:15px;z-index:999999;font-weight:bold;font-size:16px;box-shadow:0 8px 24px rgba(0,0,0,0.3);max-width:350px;font-family:-apple-system,BlinkMacSystemFont,\\'Segoe UI\\',Roboto,sans-serif;';
  progressDiv.innerHTML = \`<div style="margin-bottom:10px;">📤 Uploading...</div><div style="font-size:14px;opacity:0.9;">0/\${imageUrls.length} images processed</div>\`;
  document.body.appendChild(progressDiv);
  
  const results = [];
  let successCount = 0;
  let failCount = 0;
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;
  
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    
    try {
      progressDiv.innerHTML = \`<div style="margin-bottom:10px;">📤 Uploading...</div><div style="font-size:14px;opacity:0.9;">\${i + 1}/\${imageUrls.length} images processed</div><div style="margin-top:10px;font-size:12px;opacity:0.8;">\${imageUrl.substring(0, 40)}...</div>\`;
      
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(\`Failed to fetch: \${response.status}\`);
      }
      
      const blob = await response.blob();
      totalOriginalSize += blob.size;
      
      const compressedBlob = await compressImage(blob, 1920, 1920, 0.85);
      totalCompressedSize += compressedBlob.size;
      
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const fileName = \`flow_\${timestamp}_\${random}.jpg\`;
      
      const publicUrl = await uploadToSupabase(compressedBlob, fileName);
      
      const metadata = {
        id: \`\${timestamp}_\${random}\`,
        fileName: fileName,
        publicUrl: publicUrl,
        originalUrl: imageUrl,
        size: {
          original: blob.size,
          compressed: compressedBlob.size,
          saved: blob.size - compressedBlob.size,
          compressionRatio: \`\${((1 - compressedBlob.size / blob.size) * 100).toFixed(2)}%\`
        },
        timestamp: timestamp,
        createdAt: new Date().toISOString()
      };
      
      const jsonFileName = \`flow_\${timestamp}_\${random}.json\`;
      const jsonBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
      
      try {
        await uploadToSupabase(jsonBlob, jsonFileName, 'application/json');
      } catch (jsonError) {
        console.warn('JSON metadata upload failed:', jsonError);
      }
      
      successCount++;
      results.push(metadata);
      
      console.log(\`✅ Uploaded: \${fileName}\`);
      
    } catch (error) {
      failCount++;
      results.push({
        success: false,
        error: error.message,
        originalUrl: imageUrl
      });
      console.error(\`❌ Failed: \${error.message}\`);
    }
  }
  
  const totalCompressionRatio = totalOriginalSize > 0 
    ? ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(2)
    : 0;
  
  progressDiv.style.background = 'linear-gradient(135deg, #10b981, #059669)';
  progressDiv.innerHTML = \`<div style="margin-bottom:10px;">✅ Completed!</div><div style="font-size:14px;margin-bottom:5px;">\${successCount}/\${imageUrls.length} images uploaded</div><div style="font-size:12px;opacity:0.9;margin-top:10px;">💾 \${totalCompressionRatio}% saved<br>\${((totalOriginalSize - totalCompressedSize) / 1024 / 1024).toFixed(2)} MB saved</div>\${failCount > 0 ? \`<div style="font-size:12px;opacity:0.9;margin-top:5px;color:#fbbf24;">⚠️ \${failCount} images failed</div>\` : ''}\`;
  
  console.log('📊 Results:', {
    success: true,
    total: imageUrls.length,
    successful: successCount,
    failed: failCount,
    compression: {
      totalOriginalSize,
      totalCompressedSize,
      totalSaved: totalOriginalSize - totalCompressedSize,
      compressionRatio: \`\${totalCompressionRatio}%\`
    },
    results
  });
  
  setTimeout(() => progressDiv.remove(), 5000);
})();
`;

  const generateBookmarklet = () => {
    fetch('/api/get-supabase-key')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert('❌ ' + data.error);
          return;
        }
        
        const finalCode = bookmarkletCode.replace(
          "const SUPABASE_KEY = 'YOUR_KEY_WILL_BE_INJECTED';",
          `const SUPABASE_KEY = '${data.key}';`
        );
        
        const minified = finalCode
          .replace(/\/\/.*/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        const bookmarklet = `javascript:${encodeURIComponent(minified)}`;
        
        document.getElementById('bookmarkletCodeText').textContent = bookmarklet;
        document.getElementById('bookmarkletCode').style.display = 'block';
        document.getElementById('bookmarkletLink').href = bookmarklet;
        document.getElementById('bookmarkletArea').style.display = 'block';
        
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(bookmarklet);
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy';
          }, 2000);
        };
        copyBtn.style.cssText = 'margin-top: 10px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer;';
        if (!document.getElementById('copyBtn')) {
          copyBtn.id = 'copyBtn';
          document.getElementById('bookmarkletCode').appendChild(copyBtn);
        }
      })
      .catch(err => {
        alert('❌ Error: ' + err.message);
      });
  };

  return (
    <div style={{ 
      fontFamily: 'system-ui, sans-serif',
      maxWidth: '800px',
      margin: '50px auto',
      padding: '20px'
    }}>
      <h1 style={{ color: '#667eea', marginBottom: '20px' }}>
        🔗 Flow Bookmarklet Generator
      </h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Generate a secure bookmarklet using Vercel environment variables
      </p>

      <div style={{
        background: '#f8f9fa',
        padding: '25px',
        borderRadius: '10px',
        marginBottom: '20px'
      }}>
        <h2 style={{ color: '#333', marginBottom: '15px' }}>Usage</h2>
        <ol style={{ lineHeight: '2' }}>
          <li>Define the environment variables in Vercel:
            <ul>
              <li><code>NEXT_PUBLIC_SUPABASE_URL</code></li>
              <li><code>NEXT_PUBLIC_SUPABASE_KEY</code></li>
              <li><code>BUCKET_NAME</code></li>
            </ul>
          </li>
          <li>Click the button below</li>
          <li>Add the generated bookmarklet to your bookmarks</li>
        </ol>
      </div>

      <button
        onClick={generateBookmarklet}
        style={{
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          color: 'white',
          border: 'none',
          padding: '15px 30px',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        📤 Generate Bookmarklet
      </button>

      <div id="bookmarkletCode" style={{ display: 'none' }}>
        <h3 style={{ marginBottom: '10px' }}>Bookmarklet Code:</h3>
        <pre style={{
          background: '#2d2d2d',
          color: '#f8f8f2',
          padding: '15px',
          borderRadius: '8px',
          overflow: 'auto',
          fontSize: '12px'
        }}>
          <code id="bookmarkletCodeText"></code>
        </pre>
      </div>

      <div id="bookmarkletArea" style={{
        display: 'none',
        background: '#f8f9fa',
        padding: '30px',
        borderRadius: '10px',
        border: '2px dashed #667eea',
        textAlign: 'center',
        marginTop: '20px'
      }}>
        <p style={{ fontSize: '18px', marginBottom: '15px' }}>
          📌 Drag the button below to your bookmarks bar:
        </p>
        <a
          id="bookmarkletLink"
          href="#"
          draggable="true"
          style={{
            display: 'inline-block',
            padding: '15px 30px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '10px',
            fontWeight: 'bold',
            fontSize: '18px',
            margin: '15px 0'
          }}
        >
          📤 Flow → Supabase
        </a>
        <p style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
          Or right-click and choose &quot;Add to bookmarks&quot;
        </p>
      </div>

      <div style={{
        background: '#dbeafe',
        borderLeft: '4px solid #3b82f6',
        padding: '15px',
        borderRadius: '8px',
        marginTop: '30px'
      }}>
        <strong>💡 Note:</strong> The Supabase key is stored in Vercel environment variables and
        injected during bookmarklet generation. The key is visible in the bookmarklet, but it is
        safe when using the anon/public key only.
      </div>
    </div>
  );
}
