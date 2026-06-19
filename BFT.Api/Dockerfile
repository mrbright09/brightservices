FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
# When this folder is its own repo, adjust paths below
COPY ["BFT.Api.csproj", "."]
COPY ["../BFT.Shared/BFT.Shared.csproj", "../BFT.Shared/"]
RUN dotnet restore "BFT.Api.csproj"
COPY . .
RUN dotnet build "BFT.Api.csproj" -c Release -o /app/build

FROM build AS publish
RUN dotnet publish "BFT.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "BFT.Api.dll"]
