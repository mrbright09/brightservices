using BFT.Api.Data;
using BFT.Api.Models;
using BFT.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BFT.Api.Controllers.Freight;

[Authorize]
[ApiController]
[Route("api/freight/loads")]
public class LoadsController(BftDbContext db, ITenantService tenant) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
        => Ok(await db.Loads
            .Include(l => l.Driver)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync());

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var load = await db.Loads
            .Include(l => l.Driver)
            .FirstOrDefaultAsync(l => l.Id == id);
        return load is null ? NotFound() : Ok(load);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateLoadRequest req)
    {
        var load = new Load
        {
            Id          = Guid.NewGuid(),
            TenantId    = tenant.CurrentTenantId,
            Origin      = req.Origin,
            Destination = req.Destination,
            WeightLbs   = req.WeightLbs,
            Miles       = req.Miles,
        };
        db.Loads.Add(load);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = load.Id }, load);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var load = await db.Loads.FindAsync(id);
        if (load is null) return NotFound();
        load.Status = req.Status;
        await db.SaveChangesAsync();
        return Ok(load);
    }

    [HttpPatch("{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignDriverRequest req)
    {
        var load = await db.Loads.FindAsync(id);
        if (load is null) return NotFound();
        var driver = await db.Drivers.FindAsync(req.DriverId);
        if (driver is null) return BadRequest("Driver not found.");
        load.DriverId = req.DriverId;
        load.Status   = LoadStatus.Assigned;
        driver.Status = DriverStatus.OnDuty;
        await db.SaveChangesAsync();
        return Ok(load);
    }
}

public record CreateLoadRequest(string Origin, string Destination, decimal WeightLbs, decimal Miles);
public record UpdateStatusRequest(LoadStatus Status);
public record AssignDriverRequest(Guid DriverId);
