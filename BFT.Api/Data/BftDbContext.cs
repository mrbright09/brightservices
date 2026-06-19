using BFT.Api.Models;
using BFT.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace BFT.Api.Data;

/// <summary>
/// Single-database, shared-schema multi-tenancy.
/// Every tenant-scoped table has a TenantId column and a global query filter
/// so a query can never accidentally return another tenant's rows.
/// </summary>
public class BftDbContext(DbContextOptions<BftDbContext> options, ITenantService tenantService)
    : DbContext(options)
{
    public DbSet<Tenant>           Tenants           => Set<Tenant>();
    public DbSet<User>             Users             => Set<User>();
    public DbSet<Load>             Loads             => Set<Load>();
    public DbSet<Driver>           Drivers           => Set<Driver>();
    public DbSet<WeightCheckpoint> WeightCheckpoints => Set<WeightCheckpoint>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var tid = tenantService.CurrentTenantId;

        // Global query filters — applied automatically to every LINQ query
        modelBuilder.Entity<User>()   .HasQueryFilter(e => e.TenantId == tid);
        modelBuilder.Entity<Load>()   .HasQueryFilter(e => e.TenantId == tid);
        modelBuilder.Entity<Driver>() .HasQueryFilter(e => e.TenantId == tid);
        // WeightCheckpoint is scoped through Load.TenantId, no direct filter needed

        modelBuilder.Entity<Load>()
            .HasOne(l => l.Driver)
            .WithMany()
            .HasForeignKey(l => l.DriverId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<WeightCheckpoint>()
            .HasOne(wc => wc.Load)
            .WithMany()
            .HasForeignKey(wc => wc.LoadId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
