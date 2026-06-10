// ---------------------------------------------------------------------------
// Binary envelope format for Windows seal blobs (before base64 encoding):
//
//   [magic "NKS1", 4B][wrapped-key length, u16 BE][RSA-wrapped AES key]
//   [GCM nonce, 12B][AES-256-GCM ciphertext + 16B tag]
//
// The TPM RSA key only wraps the per-seal AES key, so payload size is
// unbounded — mirrors the macOS ECIES behaviour. Pre-envelope blobs (raw
// RSA-OAEP ciphertext) are rejected with a clear "reseal" error; there is
// deliberately no fallback decrypt path.
//
// Platform-independent on purpose: parsing/building is testable on any host
// even though only the Windows backend uses it.
// ---------------------------------------------------------------------------

use crate::types::KeyStoreError;

pub const MAGIC: &[u8; 4] = b"NKS1";
pub const NONCE_LEN: usize = 12;
/// AES-GCM authentication tag length — the minimum possible payload section.
pub const TAG_LEN: usize = 16;

#[derive(Debug)]
pub struct Envelope<'a> {
    pub wrapped_key: &'a [u8],
    pub nonce: &'a [u8],
    pub ciphertext: &'a [u8],
}

pub fn build(wrapped_key: &[u8], nonce: &[u8], ciphertext: &[u8]) -> Vec<u8> {
    debug_assert_eq!(nonce.len(), NONCE_LEN);
    debug_assert!(u16::try_from(wrapped_key.len()).is_ok());
    let mut out =
        Vec::with_capacity(MAGIC.len() + 2 + wrapped_key.len() + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&(wrapped_key.len() as u16).to_be_bytes());
    out.extend_from_slice(wrapped_key);
    out.extend_from_slice(nonce);
    out.extend_from_slice(ciphertext);
    out
}

pub fn parse(data: &[u8]) -> Result<Envelope<'_>, KeyStoreError> {
    if data.len() < MAGIC.len() || &data[..MAGIC.len()] != MAGIC {
        return Err(KeyStoreError::DecryptionFailed(
            "blob is not in envelope format (sealed by an older version?) — reseal the secret"
                .into(),
        ));
    }
    let truncated =
        || KeyStoreError::DecryptionFailed("envelope truncated or corrupted".to_string());

    let rest = &data[MAGIC.len()..];
    let (len_bytes, rest) = rest.split_at_checked(2).ok_or_else(truncated)?;
    let wrapped_len = u16::from_be_bytes([len_bytes[0], len_bytes[1]]) as usize;
    let (wrapped_key, rest) = rest.split_at_checked(wrapped_len).ok_or_else(truncated)?;
    let (nonce, ciphertext) = rest.split_at_checked(NONCE_LEN).ok_or_else(truncated)?;
    if ciphertext.len() < TAG_LEN {
        return Err(truncated());
    }
    Ok(Envelope {
        wrapped_key,
        nonce,
        ciphertext,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_parse_roundtrip() {
        let wrapped = vec![0xAA; 256];
        let nonce = [0xBB; NONCE_LEN];
        let ct = vec![0xCC; 48];
        let env_bytes = build(&wrapped, &nonce, &ct);
        let env = parse(&env_bytes).unwrap();
        assert_eq!(env.wrapped_key, wrapped.as_slice());
        assert_eq!(env.nonce, nonce.as_slice());
        assert_eq!(env.ciphertext, ct.as_slice());
    }

    #[test]
    fn parse_rejects_pre_envelope_blob_with_reseal_hint() {
        // Old-format blobs are raw RSA-2048 ciphertext: 256 random-looking
        // bytes with no magic prefix.
        let legacy = vec![0x42u8; 256];
        let err = parse(&legacy).unwrap_err();
        assert!(err.to_string().contains("reseal"));
    }

    #[test]
    fn parse_rejects_empty_and_short_input() {
        assert!(parse(&[]).is_err());
        assert!(parse(b"NKS").is_err());
    }

    #[test]
    fn parse_rejects_truncated_sections() {
        // Magic only — missing length.
        assert!(parse(b"NKS1").is_err());
        // Declared wrapped-key length longer than the data.
        let mut bad = MAGIC.to_vec();
        bad.extend_from_slice(&1000u16.to_be_bytes());
        bad.extend_from_slice(&[0u8; 10]);
        assert!(parse(&bad).is_err());
        // Valid wrapped key but ciphertext shorter than a GCM tag.
        let short_ct = build(&[0xAA; 256], &[0xBB; NONCE_LEN], &[0xCC; TAG_LEN - 1]);
        assert!(parse(&short_ct).is_err());
    }
}
