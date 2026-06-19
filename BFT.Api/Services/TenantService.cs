namespace BFT.Api.Services;

/// <summary>
/// Resolves the current tenant from the Entra JWT extension claim.
/// The API is the sole authority for tenant identity — never trust the client.
/// </summary>
public class TenantService(IHttpContextAccessor httpContextAccessor) : ITenantService
{
    // Entra External ID custom attribute claim name — set in your CIAM user flow
    private const string TenantClaim = "extension_TenantId";

    public Guid CurrentTenantId
    {
        get
        {
            var raw = httpContextAccessor.HttpContext?
                .User.FindFirst(TenantClaim)?.Value;

            return Guid.TryParse(raw, out var id)
                ? id
                : throw new UnauthorizedAccessException(
                    $"JWT is missing the '{TenantClaim}' claim. " +
                    "Ensure your Entra External ID user flow includes this attribute.");
        }
    }
}
