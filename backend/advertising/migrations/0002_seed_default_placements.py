from django.db import migrations


DEFAULT_PLACEMENTS = [
    {
        "key": "announcement_bar",
        "name": "Announcement Bar",
        "description": "Slim site-wide notification and campaign strip.",
        "max_ads_per_page": 1,
        "default_image_width": 1400,
        "default_image_height": 120,
    },
    {
        "key": "homepage_hero_banner",
        "name": "Homepage Hero Banner",
        "description": "Primary promotional banner on homepage sections.",
        "max_ads_per_page": 1,
        "default_image_width": 1600,
        "default_image_height": 520,
    },
    {
        "key": "category_page_banner",
        "name": "Category/Search Banner",
        "description": "Banner shown in category and search result contexts.",
        "max_ads_per_page": 1,
        "default_image_width": 1400,
        "default_image_height": 260,
    },
    {
        "key": "sidebar_promo",
        "name": "Sidebar Promotion",
        "description": "Compact side-column promotional card.",
        "max_ads_per_page": 1,
        "default_image_width": 480,
        "default_image_height": 640,
    },
    {
        "key": "sponsored_grid_card",
        "name": "Sponsored Grid Card",
        "description": "Sponsored card placement inside product/listing grids.",
        "max_ads_per_page": 2,
        "default_image_width": 600,
        "default_image_height": 600,
    },
    {
        "key": "promotional_strip",
        "name": "Promotional Strip",
        "description": "Mid-page horizontal promotional strip.",
        "max_ads_per_page": 1,
        "default_image_width": 1400,
        "default_image_height": 220,
    },
    {
        "key": "footer_banner",
        "name": "Footer Promotional Banner",
        "description": "Promotional banner shown above footer.",
        "max_ads_per_page": 1,
        "default_image_width": 1400,
        "default_image_height": 180,
    },
    {
        "key": "dashboard_promo_card",
        "name": "Dashboard Promotion Card",
        "description": "Promotion card shown in customer/vendor/admin dashboard surfaces.",
        "max_ads_per_page": 1,
        "default_image_width": 900,
        "default_image_height": 420,
    },
]


def seed_default_placements(apps, schema_editor):
    AdvertisingPlacement = apps.get_model("advertising", "AdvertisingPlacement")
    for placement in DEFAULT_PLACEMENTS:
        AdvertisingPlacement.objects.update_or_create(
            key=placement["key"],
            defaults={
                "name": placement["name"],
                "description": placement["description"],
                "max_ads_per_page": placement["max_ads_per_page"],
                "default_image_width": placement["default_image_width"],
                "default_image_height": placement["default_image_height"],
                "is_active": True,
            },
        )


def rollback_seed_default_placements(apps, schema_editor):
    AdvertisingPlacement = apps.get_model("advertising", "AdvertisingPlacement")
    AdvertisingPlacement.objects.filter(key__in=[item["key"] for item in DEFAULT_PLACEMENTS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("advertising", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_default_placements, rollback_seed_default_placements),
    ]
