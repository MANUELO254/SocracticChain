import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  console.log("=== PINATA UPLOAD DEBUG ===");
  
  try {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataApiSecret = process.env.PINATA_API_SECRET;

    if (!pinataApiKey || !pinataApiSecret) {
      console.error("Missing PINATA_API_KEY or PINATA_API_SECRET");
      return NextResponse.json({ error: "Pinata API key/secret not configured" }, { status: 500 });
    }

    // Use native FormData (not the form-data package)
    const formData = new FormData();
    
    // Create a Blob from the buffer
    const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
    formData.append("file", blob, file.name);
    
    // Optional: Add metadata
    formData.append("pinataMetadata", JSON.stringify({ 
      name: file.name 
    }));

    const url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;

    console.log(`Uploading to: ${url} (file: ${file.name}, type: ${file.type || 'octet-stream'}, size: ${buffer.length} bytes)`);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "pinata_api_key": pinataApiKey,
        "pinata_secret_api_key": pinataApiSecret,
      },
      body: formData, // Let FormData auto-set Content-Type with boundary
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Pinata response error:", { status: res.status, body: errorText });
      return NextResponse.json({ 
        error: `Pinata upload failed: ${res.status}`,
        details: errorText 
      }, { status: res.status });
    }

    const result = await res.json();
    const cid = result.IpfsHash;

    if (!cid) {
      throw new Error("No IPFS CID returned from Pinata");
    }

    console.log("Upload success! CID:", cid);
    
    return NextResponse.json({ 
      cid, 
      url: `https://gateway.pinata.cloud/ipfs/${cid}` 
    });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ 
      error: (error as Error).message 
    }, { status: 500 });
  }
}