import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.HashMap;
import java.util.Map;

import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.util.JRLoader;

public final class FacturaJasperRenderer {
  private FacturaJasperRenderer() {}

  public static void main(String[] args) throws Exception {
    if (args.length > 0 && "--compile".equals(args[0])) {
      compileReports();
      return;
    }
    if (args.length != 2) {
      throw new IllegalArgumentException("Uso: FacturaJasperRenderer <idfactura> <salida.pdf>");
    }
    render(Integer.parseInt(args[0]), new File(args[1]));
  }

  private static File baseDir() {
    return new File(System.getenv().getOrDefault("JASPER_REPORT_DIR", "reports"));
  }

  private static File sourceDir() {
    return new File(System.getenv().getOrDefault("JASPER_SOURCE_DIR", "../../.."));
  }

  private static void compileReports() throws Exception {
    File output = baseDir();
    if (!output.exists() && !output.mkdirs()) throw new IllegalStateException("No se pudo crear " + output);
    JasperCompileManager.compileReportToFile(
        new File(sourceDir(), "repNotaItemFactura.jrxml").getPath(),
        new File(output, "repNotaItemFactura.jasper").getPath());
    JasperCompileManager.compileReportToFile(
        new File(sourceDir(), "repNotaFactura.jrxml").getPath(),
        new File(output, "repNotaFactura.jasper").getPath());
  }

  private static void render(int facturaId, File output) throws Exception {
    Class.forName("org.postgresql.Driver");
    String host = required("DB_HOST");
    String port = required("DB_PORT");
    String database = required("DB_NAME");
    String user = required("DB_USER");
    String password = required("DB_PASSWORD");
    Map<String, Object> params = new HashMap<>();
    params.put("pidfactura", facturaId);
    params.put("total_letras", System.getenv().getOrDefault("FACTURA_TOTAL_LETRAS", ""));
    params.put("SUBREPORT_DIR", baseDir().getAbsolutePath() + File.separator);
    File parent = output.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IllegalStateException("No se pudo crear salida");
    try (Connection connection = DriverManager.getConnection(
        "jdbc:postgresql://" + host + ":" + port + "/" + database, user, password)) {
      JasperReport report = (JasperReport) JRLoader.loadObject(new File(baseDir(), "repNotaFactura.jasper"));
      JasperPrint print = JasperFillManager.fillReport(report, params, connection);
      JasperExportManager.exportReportToPdfFile(print, output.getAbsolutePath());
    }
  }

  private static String required(String name) {
    String value = System.getenv(name);
    if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException("Falta variable " + name);
    return value;
  }
}
