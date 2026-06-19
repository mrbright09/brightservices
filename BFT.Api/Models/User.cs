namespace BFT.Api.Models;

public enum UserRole { Dispatcher, Driver, Admin, Owner }

public class User
{
    public Guid     Id             { get; set; }
    public Guid     TenantId       { get; set; }
    public string   EntraObjectId  { get; set; } = string.Empty;
    public string   Email          { get; set; } = string.Empty;
    public string   DisplayName    { get; set; } = string.Empty;
    public UserRole Role           { get; set; } = UserRole.Dispatcher;
}
