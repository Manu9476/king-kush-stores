from django.db import migrations


def seed_product_reviews(apps, schema_editor):
    Product = apps.get_model("products", "Product")
    ProductReview = apps.get_model("products", "ProductReview")

    author_names = ["Amina K.", "Brian M.", "Faith N.", "Kevin O."]
    review_titles = [
        "Reliable quality",
        "Worth buying again",
        "Met expectations",
        "Good everyday pick",
    ]
    review_bodies = [
        "The quality matched what I expected and delivery was smooth.",
        "Packaging was clean, the item felt genuine, and I would order it again.",
        "Good value for the price and the product description was accurate.",
        "Solid product overall. It worked well for the intended use.",
    ]

    for product in Product.objects.all().iterator():
        if ProductReview.objects.filter(product=product).exists():
            continue

        for index in range(2):
            ProductReview.objects.create(
                product=product,
                author_name=author_names[(product.id + index) % len(author_names)],
                rating=4 if index == 0 else 5 if product.id % 2 == 0 else 4,
                title=review_titles[(product.id + index) % len(review_titles)],
                content=review_bodies[(product.id + index) % len(review_bodies)],
                is_verified_purchase=True,
                is_approved=True,
                is_featured=(index == 0),
                is_seeded=True,
            )


def unseed_product_reviews(apps, schema_editor):
    ProductReview = apps.get_model("products", "ProductReview")
    ProductReview.objects.filter(is_seeded=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("products", "0005_productreview_productreviewcomment"),
    ]

    operations = [
        migrations.RunPython(seed_product_reviews, unseed_product_reviews),
    ]
