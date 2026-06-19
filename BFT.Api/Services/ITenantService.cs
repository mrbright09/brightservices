namespace BFT.Api.Services;

public interface ITenantService
{
    Guid CurrentTenantId { get; }
}
