using BFT.Api.Data;
using BFT.Api.Models;
using BFT.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BFT.Api.Controllers.Freight;

[Authorize]
[ApiController]
[Route("api/freight/drivers")]
public class DriversController(BftDbContext db, ITenantService tenant) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
        => Ok(await db.Drivers.OrderBy(d => d.Name).ToListAsync());

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var driver = await db.Drivers.FindAsync(id);
        return driver is null ? NotFound() : Ok(driver);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDriverRequest req)
    {
        var driver = new Driver
        {
            Id       = Guid.NewGuid(),
            TenantId = tenant.CurrentTenantId,
            Name     = req.Name,
            Vehicle  = req.Vehicle,
        };
        db.Drivers.Add(driver);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = driver.Id }, driver);
    }
}

public record CreateDriverRequest(string Name, string Vehicle);
