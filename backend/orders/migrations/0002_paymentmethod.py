from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_customuser_customer_id'),
        ('orders', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentMethod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('method_type', models.CharField(choices=[('card', 'Card'), ('mpesa', 'M-Pesa')], max_length=20)),
                ('provider', models.CharField(blank=True, max_length=50, null=True)),
                ('cardholder_name', models.CharField(blank=True, max_length=120, null=True)),
                ('card_last4', models.CharField(blank=True, max_length=4, null=True)),
                ('card_expiry_month', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('card_expiry_year', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('mpesa_phone_masked', models.CharField(blank=True, max_length=25, null=True)),
                ('billing_email', models.EmailField(blank=True, max_length=254, null=True)),
                ('is_default', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payment_methods', to='users.customuser')),
            ],
            options={
                'ordering': ['-is_default', '-updated_at'],
            },
        ),
    ]
